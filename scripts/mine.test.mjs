import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const MINE = new URL('./mine.mjs', import.meta.url).pathname;
const DATE = new Date().toISOString().slice(0, 10);

const jsonl = (lines) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
const asst = (model, content = []) => ({ type: 'assistant', message: { model, usage: { input_tokens: 100, output_tokens: 50 }, content } });
const toolUse = (id, name) => ({ type: 'tool_use', id, name, input: {} });
const toolErr = (id) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: true }] } });
const prompt = (text, ts) => ({ type: 'user', timestamp: ts, message: { content: text } });

function run(sessions, { preSidecar, extraArgs = [] } = {}) {
  const src = mkdtempSync(join(tmpdir(), 'mine-src-'));
  const state = mkdtempSync(join(tmpdir(), 'mine-state-'));
  for (const [rel, lines] of Object.entries(sessions)) {
    const file = join(src, rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, jsonl(lines));
  }
  if (preSidecar) {
    mkdirSync(join(state, 'reports'), { recursive: true });
    writeFileSync(join(state, 'reports', '2000-01-01.json'), JSON.stringify(preSidecar));
  }
  execFileSync(process.execPath, [MINE, '--no-health', '--src', src, '--state', state, ...extraArgs]);
  return {
    report: readFileSync(join(state, 'reports', `${DATE}.md`), 'utf8'),
    sidecar: JSON.parse(readFileSync(join(state, 'reports', `${DATE}.json`), 'utf8')),
  };
}

test('unknown model tier flagged, known tiers priced, health skipped', () => {
  const { report } = run({
    'proj/a.jsonl': [asst('claude-sonnet-5'), asst('claude-zeta-9')],
  });
  assert.match(report, /skipped \(--no-health\)/);
  assert.match(report, /WARN unknown pricing tier for: claude-zeta-9/);
  assert.match(report, /\| claude-zeta-9 \|.*\| n\/a \|/);
  assert.match(report, /\| claude-sonnet-5 \|.*\| \$\d/);
  assert.match(report, /excludes unknown-tier models/);
});

test('friction: errors by tool, denials by kind, interrupts, retry loop', () => {
  const { report, sidecar } = run({
    'proj/a.jsonl': [
      asst('claude-sonnet-5', [toolUse('t1', 'Bash')]),
      toolErr('t1'),
      asst('claude-sonnet-5', [toolUse('t2', 'Bash')]),
      toolErr('t2'),
      asst('claude-sonnet-5', [toolUse('t3', 'Bash')]),
      { ...toolErr('t9'), toolDenialKind: 'user-rejected' },
      { type: 'user', interruptedMessageId: 'x', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
    ],
  });
  assert.match(report, /Tool errors \(incl\. subagents\): Bash 2/);
  assert.match(report, /Permission denials: user-rejected 1/);
  assert.match(report, /User interrupts: 1/);
  assert.match(report, /\| proj \| a\.jsonl \| Bash \| 3 \| 2 \|/);
  assert.equal(sidecar.friction.retryLoops, 1);
});

test('retry loops detected in subagent transcripts and denial-only runs', () => {
  const { sidecar, report } = run({
    // subagent hammering Bash: 3 calls, 2 errors
    'proj/sess1/subagents/s.jsonl': [
      asst('claude-sonnet-5', [toolUse('s1', 'Bash')]), toolErr('s1'),
      asst('claude-sonnet-5', [toolUse('s2', 'Bash')]), toolErr('s2'),
      asst('claude-sonnet-5', [toolUse('s3', 'Bash')]),
    ],
    // main session: 3 consecutive denials on same tool
    'proj/main.jsonl': [
      asst('claude-sonnet-5', [toolUse('d1', 'Write')]), { ...toolErr('d1'), toolDenialKind: 'user-rejected' },
      asst('claude-sonnet-5', [toolUse('d2', 'Write')]), { ...toolErr('d2'), toolDenialKind: 'user-rejected' },
      asst('claude-sonnet-5', [toolUse('d3', 'Write')]), { ...toolErr('d3'), toolDenialKind: 'user-rejected' },
    ],
  });
  assert.equal(sidecar.friction.retryLoops, 2);
  assert.match(report, /\| proj \| s\.jsonl \| Bash \| 3 \| 2 \|/);
  assert.match(report, /\| proj \| main\.jsonl \| Write \| 3 \| 3 \|/);
  // denials are not double-counted as tool errors
  assert.match(report, /Tool errors \(incl\. subagents\): Bash 2\n/);
});

test('scripted sessions excluded from prompt stats; manual project exclusion works', () => {
  const t = (s) => `2026-01-01T00:0${0}:${String(s).padStart(2, '0')}.000Z`;
  const slow = (s) => `2026-01-01T0${s}:00:00.000Z`;
  const { report, sidecar } = run({
    // human: 3 identical prompts, hours apart -> counted
    'human/a.jsonl': [prompt('fix the build please', slow(1)), prompt('fix the build please', slow(2)), prompt('fix the build please', slow(3))],
    // burst: 4 prompts 1s apart -> excluded
    'burst/b.jsonl': [prompt('spam prompt', t(1)), prompt('spam prompt', t(2)), prompt('spam prompt', t(3)), prompt('spam prompt', t(4))],
    // sdk entrypoint -> excluded
    'sdk/c.jsonl': [{ ...prompt('sdk prompt', slow(1)), entrypoint: 'sdk-cli' }, prompt('sdk prompt', slow(2)), prompt('sdk prompt', slow(3))],
    // manually excluded project
    'noisy/d.jsonl': [prompt('noisy prompt', slow(1)), prompt('noisy prompt', slow(2)), prompt('noisy prompt', slow(3))],
  }, { extraArgs: ['--exclude-project', 'noisy'] });
  assert.match(report, /\| 3 \| fix the build please \|/);
  assert.doesNotMatch(report, /spam prompt/);
  assert.doesNotMatch(report, /sdk prompt/);
  assert.doesNotMatch(report, /noisy prompt/);
  assert.match(report, /3 scripted session\(s\) excluded/);
  assert.equal(sidecar.scriptedExcluded, 3);
});

test('delta: no previous run on first run', () => {
  const { report } = run({ 'proj/a.jsonl': [asst('claude-sonnet-5')] });
  assert.match(report, /## Delta since last report\n- no previous run/);
});

test('delta vs previous sidecar: new models, tool shifts, resolved health findings', () => {
  const { report } = run({
    'proj/a.jsonl': [
      asst('claude-fable-5', Array.from({ length: 30 }, (_, i) => toolUse(`t${i}`, 'Bash'))),
      asst('claude-sonnet-5'),
    ],
  }, {
    preSidecar: {
      date: '2000-01-01',
      models: { 'claude-sonnet-5': 10 },
      tools: { Bash: 20 },
      agents: {},
      healthFindings: ['MCP servers: WARN `dead`: failed'],
      friction: {}, scriptedExcluded: 0,
    },
  });
  assert.match(report, /New models: claude-fable-5/);
  assert.match(report, /Bash: 20 → 30 \(\+50%\)/);
  assert.match(report, /Resolved health findings:\n {2}- MCP servers: WARN `dead`: failed/);
});
