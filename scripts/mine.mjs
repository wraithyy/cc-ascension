#!/usr/bin/env node
// Session miner: aggregates Claude Code transcripts into a markdown report.
// Usage: node mine.mjs [--days N] [--src DIR] [--state DIR] [--no-health] [--exclude-project NAME]...
//   --days N              only sessions modified in the last N days (default: all)
//   --src DIR             transcript root (default: ~/.claude/projects; point at a backup mirror for >30d history)
//   --state DIR           state dir for reports (default: $CC_ASCENSION_STATE or ~/.claude/evolution)
//   --no-health           skip config health checks (tests / non-host runs)
//   --exclude-project N   exclude project from prompt stats (repeatable)
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const HOME = homedir();
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const args = (name) =>
  process.argv.flatMap((a, i) => (a === name && process.argv[i + 1] ? [process.argv[i + 1]] : []));
const root = arg('--src') ?? join(HOME, '.claude', 'projects');
const state = arg('--state') ?? process.env.CC_ASCENSION_STATE ?? join(HOME, '.claude', 'evolution');
const days = arg('--days');
const cutoff = days ? Date.now() - Number(days) * 864e5 : 0;
const noHealth = process.argv.includes('--no-health');
const excludeProjects = new Set(args('--exclude-project'));

// $/MTok: [input, output, cacheRead, cacheWrite]. Verify against docs.anthropic.com when models change.
const PRICES = {
  fable: [10, 50, 1, 12.5],
  opus: [5, 25, 0.5, 6.25],
  sonnet: [3, 15, 0.3, 3.75],
  haiku: [1, 5, 0.1, 1.25],
};
const tier = (m) => Object.keys(PRICES).find((t) => m.includes(t)); // undefined = unknown, flagged in report

const projects = {};   // project -> {sessions, msgs}
const models = {};     // model -> {count, in, out, cr, cw}
const tools = {};      // tool -> count
const agents = {};     // subagent_type -> Agent-call count (from main transcripts)
const subModels = {};  // model -> msg count inside subagent transcripts
const prompts = {};    // normalized prefix -> count (scripted sessions excluded)
const sessions = {};   // file -> {msgs, project, prompts:[{key,ts}], sdk, friction, toolSeq}
let files = 0;
let oldest = Infinity;

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.jsonl') ? [join(dir, e.name)] : []
  );

for (const file of walk(root)) {
  const mtime = statSync(file).mtimeMs;
  if (cutoff && mtime < cutoff) continue;
  if (mtime < oldest) oldest = mtime;
  files++;
  const project = file.slice(root.length + 1).split('/')[0];
  (projects[project] ??= { sessions: 0, msgs: 0 }).sessions++;
  const sess = sessions[file] = {
    msgs: 0, project, prompts: [], sdk: false,
    friction: { errors: {}, denials: {}, interrupts: 0 },
    toolSeq: [], // ordered tool_use calls in main transcripts: {id, name, err}
  };
  const toolById = {}; // tool_use_id -> toolSeq entry, to attribute errors to tool names
  const isSub = file.includes('/subagents/');

  for (const line of readFileSync(file, 'utf8').split('\n')) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.entrypoint === 'sdk-cli') sess.sdk = true;
    const m = o.message;
    if (o.type === 'assistant' && m) {
      projects[project].msgs++; sess.msgs++;
      const mt = models[m.model ?? '?'] ??= { count: 0, in: 0, out: 0, cr: 0, cw: 0 };
      mt.count++;
      const u = m.usage ?? {};
      mt.in += u.input_tokens ?? 0; mt.out += u.output_tokens ?? 0;
      mt.cr += u.cache_read_input_tokens ?? 0; mt.cw += u.cache_creation_input_tokens ?? 0;
      if (isSub) subModels[m.model ?? '?'] = (subModels[m.model ?? '?'] ?? 0) + 1;
      for (const b of Array.isArray(m.content) ? m.content : [])
        if (b.type === 'tool_use') {
          tools[b.name] = (tools[b.name] ?? 0) + 1;
          const entry = { name: b.name, err: false };
          if (b.id) toolById[b.id] = entry;
          sess.toolSeq.push(entry);
          if (!isSub && (b.name === 'Agent' || b.name === 'Task'))
            agents[b.input?.subagent_type ?? 'general-purpose'] = (agents[b.input?.subagent_type ?? 'general-purpose'] ?? 0) + 1;
        }
    } else if (o.type === 'user' && m) {
      if (o.interruptedMessageId !== undefined) sess.friction.interrupts++;
      if (o.toolDenialKind) {
        sess.friction.denials[o.toolDenialKind] = (sess.friction.denials[o.toolDenialKind] ?? 0) + 1;
        // not counted as a tool error, but a denied call still feeds retry-loop detection
        if (Array.isArray(m.content))
          for (const b of m.content)
            if (b.type === 'tool_result' && toolById[b.tool_use_id]) toolById[b.tool_use_id].err = true;
      } else if (Array.isArray(m.content)) {
        for (const b of m.content)
          if (b.type === 'tool_result' && b.is_error === true) {
            const entry = toolById[b.tool_use_id];
            if (entry) entry.err = true;
            const name = entry?.name ?? '?';
            sess.friction.errors[name] = (sess.friction.errors[name] ?? 0) + 1;
          }
      }
      if (o.isMeta) continue;
      const c = m.content;
      const text = typeof c === 'string' ? c
        : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join(' ') : '';
      const t = text.trim();
      if (!t || t.startsWith('<') || t.startsWith('[')) continue;
      // ponytail: naive similarity = normalized 60-char prefix; embeddings later if needed
      const key = t.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
      sess.prompts.push({ key, ts: Date.parse(o.timestamp) || 0 });
    }
  }
}

// Scripted-session classification: sdk-cli entrypoint, or >=3 prompts with median gap <5s, or excluded project.
// Scripted sessions are dropped from repeated-prompt stats only (journal entry 1: aiworkflow contamination).
let scriptedExcluded = 0;
for (const sess of Object.values(sessions)) {
  const gaps = sess.prompts.slice(1).map((p, i) => p.ts - sess.prompts[i].ts).sort((a, b) => a - b);
  // ponytail: upper-middle element, not a true median — good enough for a <5s threshold
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : Infinity;
  const scripted = sess.sdk || (sess.prompts.length >= 3 && median < 5000) || excludeProjects.has(sess.project);
  if (scripted && sess.prompts.length) { scriptedExcluded++; continue; }
  for (const { key } of sess.prompts) prompts[key] = (prompts[key] ?? 0) + 1;
}

// Retry loops: run of >=3 consecutive same-tool calls containing >=1 error.
const retryLoops = [];
for (const [file, sess] of Object.entries(sessions)) {
  let run = null;
  const flush = () => {
    if (run && run.count >= 3 && run.errs >= 1)
      retryLoops.push({ project: sess.project, file: file.split('/').pop(), tool: run.name, count: run.count, errs: run.errs });
  };
  for (const t of sess.toolSeq) {
    if (run?.name === t.name) { run.count++; run.errs += t.err ? 1 : 0; }
    else { flush(); run = { name: t.name, count: 1, errs: t.err ? 1 : 0 }; }
  }
  flush();
}

// Aggregate friction across sessions.
const friction = { errors: {}, denials: {}, interrupts: 0 };
for (const { friction: f } of Object.values(sessions)) {
  for (const [k, v] of Object.entries(f.errors)) friction.errors[k] = (friction.errors[k] ?? 0) + v;
  for (const [k, v] of Object.entries(f.denials)) friction.denials[k] = (friction.denials[k] ?? 0) + v;
  friction.interrupts += f.interrupts;
}

// Config health. Never embed raw command output — `claude mcp list` prints server args incl. secrets.
// Chezmoi checks self-skip when chezmoi doesn't manage this machine.
let chezmoiSrc = null;
if (!noHealth)
  try { chezmoiSrc = execSync('chezmoi source-path 2>/dev/null', { encoding: 'utf8', timeout: 15000 }).trim(); } catch {}

const healthChecks = [
  ['MCP servers', () => {
    const out = execSync('claude mcp list 2>&1', { encoding: 'utf8', timeout: 120000 });
    const seen = {};
    const lines = [];
    for (const l of out.split('\n')) {
      const m = l.match(/^(\S[^:]*):\s.*\s-\s(.+)$/);
      if (!m) continue;
      const [, name, status] = m;
      seen[name] = (seen[name] ?? 0) + 1;
      if (!status.includes('Connected')) lines.push(`WARN \`${name}\`: ${status.replace(/^[!✗x]\s*/, '')}`);
    }
    for (const [name, n] of Object.entries(seen))
      if (n > 1) lines.push(`FAIL \`${name}\`: listed ${n} times (duplicate registration)`);
    return lines;
  }],
  ['Marketplace sources exist', () => {
    const mp = JSON.parse(readFileSync(join(HOME, '.claude', 'plugins', 'known_marketplaces.json'), 'utf8'));
    const lines = [];
    for (const [name, entry] of Object.entries(mp)) {
      const src = entry.source ?? {};
      if (src.source === 'directory' && !existsSync(src.path))
        lines.push(`FAIL \`${name}\`: directory source \`${src.path}\` does not exist (fails to load every session)`);
    }
    return lines;
  }],
  ['Secrets in MCP server config', () => {
    // scan only the mcpServers block; never print the matched value
    const lines = [];
    for (const file of [join(HOME, '.claude.json'), join(HOME, '.mcp.json')]) {
      if (!existsSync(file)) continue;
      const servers = JSON.parse(readFileSync(file, 'utf8')).mcpServers ?? {};
      for (const [name, cfg] of Object.entries(servers))
        if (/glpat-[\w-]{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[bp]-[\w-]{20,}/.test(JSON.stringify(cfg)))
          lines.push(`FAIL \`${name}\` in ${file.split('/').pop()}: secret-looking string in server config — move it behind an env fetch (e.g. op read wrapper)`);
    }
    return lines;
  }],
  ['Plugin provenance vs chezmoi source', () => {
    if (!chezmoiSrc) throw new Error('chezmoi not detected');
    const tmpl = readFileSync(join(chezmoiSrc, 'dot_claude', 'settings.json.tmpl'), 'utf8');
    const enabledBlock = tmpl.match(/"enabledPlugins"\s*:\s*\{([^}]*)\}/)?.[1] ?? '';
    const enabled = new Set([...enabledBlock.matchAll(/"([^"]+@[^"]+)"\s*:\s*true/g)].map((m) => m[1]));
    const installed = JSON.parse(readFileSync(join(HOME, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'));
    const lines = [];
    for (const key of Object.keys(installed.plugins ?? {})) {
      const [name] = key.split('@');
      if (enabled.has(key)) continue;
      const sourceKey = [...enabled].find((k) => k.startsWith(`${name}@`));
      if (sourceKey) lines.push(`FAIL \`${key}\` installed but chezmoi source enables \`${sourceKey}\` (marketplace mismatch — clone risk)`);
    }
    for (const key of enabled)
      if (!(key in (installed.plugins ?? {}))) lines.push(`WARN \`${key}\` enabled in chezmoi source but not installed`);
    return lines;
  }],
  ['chezmoi drift (~/.claude)', () => {
    if (!chezmoiSrc) throw new Error('chezmoi not detected');
    // `-r` is mandatory: with a directory target, chezmoi does not recurse, so the
    // pre-2026-08-05 form (`chezmoi diff --include=files ~/.claude`) matched nothing and
    // this check reported OK unconditionally (verified chezmoi v2.65.0).
    const destDir = execSync('chezmoi execute-template "{{ .chezmoi.destDir }}"', { encoding: 'utf8', timeout: 15000 }).trim();
    const out = execSync(`chezmoi status --include=files -r ${join(HOME, '.claude')} 2>&1`, { encoding: 'utf8', timeout: 60000 });
    const rels = out.split('\n').map((l) => l.slice(2).trim()).filter(Boolean);
    // Claude Code rewrites settings.json (key order included) on /model, /theme, /config.
    // Compare JSON semantically so cosmetic reordering does not train the reader to ignore
    // this row — a noisy sensor is as useless as the silent one it replaced.
    const flat = (v, p = '', acc = {}) => {
      if (v && typeof v === 'object' && !Array.isArray(v))
        for (const [k, x] of Object.entries(v)) flat(x, p ? `${p}.${k}` : k, acc);
      else acc[p] = JSON.stringify(v);
      return acc;
    };
    const lines = [];
    for (const rel of rels) {
      const abs = join(destDir, rel);
      let source, live;
      try {
        source = JSON.parse(execSync(`chezmoi cat ${abs}`, { encoding: 'utf8', timeout: 30000 }));
        live = JSON.parse(readFileSync(abs, 'utf8'));
      } catch {
        lines.push(`WARN \`${rel}\` differs from chezmoi source — run \`chezmoi diff ${abs}\``);
        continue;
      }
      const a = flat(source), b = flat(live);
      // key paths only, never values: settings.json carries env/hook command strings
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
      if (keys.length)
        lines.push(`WARN \`${rel}\`: ${keys.length} key(s) drifted from chezmoi source (${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ', …' : ''}) — live edits are lost on next \`chezmoi apply\``);
    }
    return lines;
  }],
];
const healthFindings = []; // WARN/FAIL lines only, for the sidecar + delta
const healthRows = noHealth ? ['- skipped (--no-health)'] : healthChecks.map(([label, fn]) => {
  try {
    const lines = fn();
    healthFindings.push(...lines.map((l) => `${label}: ${l}`));
    return lines.length ? `- **${label}**:\n${lines.map((l) => `  - ${l}`).join('\n')}` : `- **${label}**: OK`;
  } catch (e) {
    return `- **${label}**: SKIPPED (${String(e.message ?? e).split('\n')[0]})`;
  }
});

const fmt = (n) => n.toLocaleString('en-US');
const cost = (t, [i, o, r, w]) => (t.in * i + t.out * o + t.cr * r + t.cw * w) / 1e6;
const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
const date = new Date().toISOString().slice(0, 10);
const oldestDate = files ? new Date(oldest).toISOString().slice(0, 10) : 'n/a';

let totalCost = 0;
const unknownTiers = [];
const modelRows = Object.entries(models).map(([m, t]) => {
  const tr = tier(m);
  let c = 'n/a';
  if (tr) { const v = cost(t, PRICES[tr]); totalCost += v; c = `$${v.toFixed(2)}`; }
  else unknownTiers.push(m);
  return `| ${m} | ${fmt(t.count)} | ${fmt(t.in)} | ${fmt(t.out)} | ${fmt(t.cr)} | ${fmt(t.cw)} | ${c} |`;
});

// Delta vs newest previous sidecar in reports/.
const reportsDir = join(state, 'reports');
mkdirSync(reportsDir, { recursive: true });
// same-day reruns compare against the previous day's sidecar (today's is excluded, then overwritten)
const prevFile = readdirSync(reportsDir)
  .filter((f) => f.endsWith('.json') && f !== `${date}.json`).sort().pop();
const deltaLines = [];
if (prevFile) {
  const prev = JSON.parse(readFileSync(join(reportsDir, prevFile), 'utf8'));
  const newKeys = (cur, old) => Object.keys(cur).filter((k) => !(k in (old ?? {})));
  const nm = newKeys(models, prev.models);
  if (nm.length) deltaLines.push(`- New models: ${nm.join(', ')}`);
  const na = newKeys(agents, prev.agents);
  if (na.length) deltaLines.push(`- New agent types used: ${na.join(', ')}`);
  const newH = healthFindings.filter((l) => !(prev.healthFindings ?? []).includes(l));
  const resolvedH = (prev.healthFindings ?? []).filter((l) => !healthFindings.includes(l));
  if (newH.length) deltaLines.push(`- New health findings:\n${newH.map((l) => `  - ${l}`).join('\n')}`);
  if (resolvedH.length) deltaLines.push(`- Resolved health findings:\n${resolvedH.map((l) => `  - ${l}`).join('\n')}`);
  const shifts = Object.entries(tools).flatMap(([t, c]) => {
    const p = prev.tools?.[t];
    if (!p || Math.max(p, c) < 20) return [];
    const pct = ((c - p) / p) * 100;
    return Math.abs(pct) >= 20 ? [`  - ${t}: ${fmt(p)} → ${fmt(c)} (${pct > 0 ? '+' : ''}${pct.toFixed(0)}%)`] : [];
  });
  if (shifts.length) deltaLines.push(`- Tool usage shifts (≥±20%, ≥20 calls):\n${shifts.join('\n')}`);
  if (!deltaLines.length) deltaLines.push('- no significant changes');
  deltaLines.unshift(`vs \`${prevFile}\` — note: windows overlap when both runs use --days.`);
} else {
  deltaLines.push('- no previous run');
}

const frictionRows = [
  `- Tool errors (incl. subagents): ${top(friction.errors, 10).map(([t, c]) => `${t} ${fmt(c)}`).join(', ') || 'none'}`,
  `- Permission denials: ${top(friction.denials, 10).map(([k, c]) => `${k} ${fmt(c)}`).join(', ') || 'none'}`,
  `- User interrupts: ${fmt(friction.interrupts)}`,
  retryLoops.length
    ? `- Retry loops (same tool ≥3× in a row, ≥1 error):\n\n| Project | Session | Tool | Calls | Errors |\n|---|---|---|---|---|\n${retryLoops
        .sort((a, b) => b.errs - a.errs).slice(0, 15)
        .map((r) => `| ${r.project} | ${r.file} | ${r.tool} | ${r.count} | ${r.errs} |`).join('\n')}`
    : '- Retry loops: none',
];

const report = `# Mining report ${date}

> Contains project names — local evidence only, do not publish.

Scope: ${files} session files from \`${root}\`${cutoff ? ` (last ${days} days by mtime)` : ''}.
Oldest transcript: ${oldestDate} — if this is recent, local history may be pruned (~30d); consider the optional backup mirror.
Costs estimated from list prices.

Models seen: ${Object.keys(models).join(', ') || 'none'}

## Delta since last report
${deltaLines.join('\n')}

## Config health
${healthRows.join('\n')}

## Friction candidates (mined — weaker signal than /friction entries)
${frictionRows.join('\n')}

## Models
${unknownTiers.length ? `WARN unknown pricing tier for: ${unknownTiers.join(', ')} — update PRICES in scripts/mine.mjs (cost shown as n/a).\n` : ''}| Model | Msgs | Input | Output | Cache read | Cache write | Est. cost |
|---|---|---|---|---|---|---|
${modelRows.join('\n')}

**Total est. cost: $${totalCost.toFixed(2)}${unknownTiers.length ? ' (excludes unknown-tier models)' : ''}**

## Projects (top 15 by sessions)
| Project | Sessions | Assistant msgs |
|---|---|---|
${top(Object.fromEntries(Object.entries(projects).map(([k, v]) => [k, v.sessions])), 15)
  .map(([p]) => `| ${p} | ${projects[p].sessions} | ${fmt(projects[p].msgs)} |`).join('\n')}

## Tools (top 25)
| Tool | Calls |
|---|---|
${top(tools, 25).map(([t, c]) => `| ${t} | ${fmt(c)} |`).join('\n')}

## Subagent usage (Agent calls by type, top 20)
| Agent type | Calls |
|---|---|
${top(agents, 20).map(([a, c]) => `| ${a} | ${fmt(c)} |`).join('\n')}

## Subagent messages by model
| Model | Msgs |
|---|---|
${top(subModels, 10).map(([m, c]) => `| ${m} | ${fmt(c)} |`).join('\n')}

## Repeated prompts (top 20, normalized 60-char prefix, count >= 3)
${scriptedExcluded ? `${scriptedExcluded} scripted session(s) excluded (sdk-cli entrypoint, prompt bursts <5s median, or --exclude-project).\n` : ''}| Count | Prompt prefix |
|---|---|
${top(prompts, 20).filter(([, c]) => c >= 3).map(([p, c]) => `| ${c} | ${p.replace(/\|/g, '\\|')} |`).join('\n')}

## Longest sessions (top 10 by assistant msgs)
| Msgs | Project | File |
|---|---|---|
${top(Object.fromEntries(Object.entries(sessions).map(([k, v]) => [k, v.msgs])), 10)
  .map(([f]) => `| ${sessions[f].msgs} | ${sessions[f].project} | ${f.split('/').pop()} |`).join('\n')}
`;

const out = join(reportsDir, `${date}.md`);
writeFileSync(out, report);
// Sidecar for next run's delta. Counts only — no prompt text, no token detail.
writeFileSync(join(reportsDir, `${date}.json`), JSON.stringify({
  date,
  models: Object.fromEntries(Object.entries(models).map(([k, v]) => [k, v.count])),
  tools,
  agents,
  friction: { ...friction, retryLoops: retryLoops.length },
  healthFindings,
  scriptedExcluded,
}, null, 2));
console.log(`wrote ${out}`);
