#!/usr/bin/env node
// Session miner: aggregates Claude Code transcripts into a markdown report.
// Usage: node mine.mjs [--days N] [--src DIR] [--state DIR]
//   --days N    only sessions modified in the last N days (default: all)
//   --src DIR   transcript root (default: ~/.claude/projects; point at a backup mirror for >30d history)
//   --state DIR state dir for reports (default: $CC_ASCENSION_STATE or ~/.claude/evolution)
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const HOME = homedir();
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const root = arg('--src') ?? join(HOME, '.claude', 'projects');
const state = arg('--state') ?? process.env.CC_ASCENSION_STATE ?? join(HOME, '.claude', 'evolution');
const days = arg('--days');
const cutoff = days ? Date.now() - Number(days) * 864e5 : 0;

// $/MTok: [input, output, cacheRead, cacheWrite]. Verify against docs.anthropic.com when models change.
const PRICES = {
  fable: [10, 50, 1, 12.5],
  opus: [5, 25, 0.5, 6.25],
  sonnet: [3, 15, 0.3, 3.75],
  haiku: [1, 5, 0.1, 1.25],
};
const tier = (m) => Object.keys(PRICES).find((t) => m.includes(t)) ?? 'sonnet';

const projects = {};   // project -> {sessions, msgs}
const models = {};     // model -> {count, in, out, cr, cw}
const tools = {};      // tool -> count
const prompts = {};    // normalized prefix -> count
const sessions = {};   // file -> {msgs, project}
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
  sessions[file] = { msgs: 0, project };

  for (const line of readFileSync(file, 'utf8').split('\n')) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const m = o.message;
    if (o.type === 'assistant' && m) {
      projects[project].msgs++; sessions[file].msgs++;
      const mt = models[m.model ?? '?'] ??= { count: 0, in: 0, out: 0, cr: 0, cw: 0 };
      mt.count++;
      const u = m.usage ?? {};
      mt.in += u.input_tokens ?? 0; mt.out += u.output_tokens ?? 0;
      mt.cr += u.cache_read_input_tokens ?? 0; mt.cw += u.cache_creation_input_tokens ?? 0;
      for (const b of Array.isArray(m.content) ? m.content : [])
        if (b.type === 'tool_use') tools[b.name] = (tools[b.name] ?? 0) + 1;
    } else if (o.type === 'user' && m && !o.isMeta) {
      const c = m.content;
      const text = typeof c === 'string' ? c
        : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join(' ') : '';
      const t = text.trim();
      if (!t || t.startsWith('<') || t.startsWith('[')) continue;
      // ponytail: naive similarity = normalized 60-char prefix; embeddings later if needed
      const key = t.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
      prompts[key] = (prompts[key] ?? 0) + 1;
    }
  }
}

// Config health. Never embed raw command output — `claude mcp list` prints server args incl. secrets.
// Chezmoi checks self-skip when chezmoi doesn't manage this machine.
let chezmoiSrc = null;
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
    const out = execSync(`chezmoi diff --include=files ${join(HOME, '.claude')} 2>&1`, { encoding: 'utf8', timeout: 60000 });
    const n = out.split('\n').filter((l) => l.startsWith('+++ ')).length;
    return n ? [`WARN ${n} file(s) drifted from chezmoi source — run \`chezmoi diff ~/.claude\``] : [];
  }],
];
const healthRows = healthChecks.map(([label, fn]) => {
  try {
    const lines = fn();
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
const modelRows = Object.entries(models).map(([m, t]) => {
  const c = cost(t, PRICES[tier(m)]); totalCost += c;
  return `| ${m} | ${fmt(t.count)} | ${fmt(t.in)} | ${fmt(t.out)} | ${fmt(t.cr)} | ${fmt(t.cw)} | $${c.toFixed(2)} |`;
});

const report = `# Mining report ${date}

> Contains project names — local evidence only, do not publish.

Scope: ${files} session files from \`${root}\`${cutoff ? ` (last ${days} days by mtime)` : ''}.
Oldest transcript: ${oldestDate} — if this is recent, local history may be pruned (~30d); consider the optional backup mirror.
Costs estimated from list prices.

Models seen: ${Object.keys(models).join(', ') || 'none'}

## Config health
${healthRows.join('\n')}

## Models
| Model | Msgs | Input | Output | Cache read | Cache write | Est. cost |
|---|---|---|---|---|---|---|
${modelRows.join('\n')}

**Total est. cost: $${totalCost.toFixed(2)}**

## Projects (top 15 by sessions)
| Project | Sessions | Assistant msgs |
|---|---|---|
${top(Object.fromEntries(Object.entries(projects).map(([k, v]) => [k, v.sessions])), 15)
  .map(([p]) => `| ${p} | ${projects[p].sessions} | ${fmt(projects[p].msgs)} |`).join('\n')}

## Tools (top 25)
| Tool | Calls |
|---|---|
${top(tools, 25).map(([t, c]) => `| ${t} | ${fmt(c)} |`).join('\n')}

## Repeated prompts (top 20, normalized 60-char prefix, count >= 3)
| Count | Prompt prefix |
|---|---|
${top(prompts, 20).filter(([, c]) => c >= 3).map(([p, c]) => `| ${c} | ${p.replace(/\|/g, '\\|')} |`).join('\n')}

## Longest sessions (top 10 by assistant msgs)
| Msgs | Project | File |
|---|---|---|
${top(Object.fromEntries(Object.entries(sessions).map(([k, v]) => [k, v.msgs])), 10)
  .map(([f]) => `| ${sessions[f].msgs} | ${sessions[f].project} | ${f.split('/').pop()} |`).join('\n')}
`;

mkdirSync(join(state, 'reports'), { recursive: true });
const out = join(state, 'reports', `${date}.md`);
writeFileSync(out, report);
console.log(`wrote ${out}`);
