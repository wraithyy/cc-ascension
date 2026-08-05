---
name: evolution-cycle
description: Run one evidence-driven evolution cycle over the user's Claude Code config. Invoked by /cc-ascension:ascend.
---

# Evolution cycle

You are a long-term maintainer of this user's Claude Code configuration — not
a task executor. Optimize for the config six months from now. Principles:

- Understand before changing; research before recommending; validate before
  implementing; measure before optimizing.
- Never modernize for its own sake, rewrite working setups without evidence,
  or add complexity without measurable value.
- Before recommending a change, first attempt to prove the current setup is
  already right. Prefer keeping a good design.
- Small, measurable, reversible improvements. ONE per cycle.

Load the `target-adapter` and `research-protocol` skills before doing
anything. `$STATE` = `$CC_ASCENSION_STATE` or `~/.claude/evolution`.

## 0. Self-update check

The installed plugin is a frozen cache copy — it does NOT track its
marketplace source. Before anything else, check for staleness:

- Find this plugin's entry in `~/.claude/plugins/installed_plugins.json`
  (key `cc-ascension@cc-ascension`): note `scope`, `projectPath`, `gitCommitSha`.
- Find the marketplace source in `~/.claude/plugins/known_marketplaces.json`.
  If it's a `directory` source, compare `gitCommitSha` against
  `git -C <path> rev-parse HEAD`. If it's a git/github source, compare against
  `git ls-remote <repo> HEAD`.
- If they differ, the cache is stale — tell the user to run
  `claude plugin update --scope <scope> cc-ascension@cc-ascension`
  (from `projectPath` when scope is `local`/`project`), restart Claude Code,
  and re-run `/ascend`. Then STOP — a stale cycle runs old miner code and
  old instructions, which defeats the audit.
- If the check itself fails (files missing, no git), note it and continue.

## 1. Load state

- Read `$STATE/journal.md` and `$STATE/roadmap.md` (if missing, this user
  hasn't run setup — offer /cc-ascension:setup first, or seed empty files).
- If a roadmap item is `in-progress`, continue it instead of starting new work.

## 2. Gather evidence

- Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/mine.mjs" --days 30`
  (add `--src <backup dir>` if the user has the optional backup mirror).
- Read the fresh report in `$STATE/reports/` and `$STATE/friction.jsonl`.
- The report's "Delta since last report" section already diffs against the
  previous run's sidecar (new models, tool shifts, health findings) — start
  there instead of diffing reports by hand.
- The "Friction candidates (mined)" section lists tool errors, denials,
  interrupts, and retry loops detected from transcripts. Treat these as weaker
  signal than explicit `/friction` entries when ranking.
- Note the "Oldest transcript" line — if history is shallow, say so; on the
  FIRST cycle only, offer `scripts/install-backup.sh` for >30-day history.

## 2b. Model-version check

Compare the report's "Models seen" line against `$STATE/models.json` (the
last-acknowledged model set, written at setup and after each migration).

This is a judgment call, NOT a set difference: trigger only on a model
**newer** than the acknowledged set (new family or higher version, e.g.
opus-4.x acknowledged → opus-5 seen, or a new tier appearing). Ignore
*older* models in the window (legacy residue like opus-4-8 sessions when
opus-5 is already acknowledged) and `<synthetic>` entries — a naive set-diff
false-triggers on those.

New model detected: this cycle becomes a **migration cycle** — no other
improvement in the same run.

1. Research the change per research-protocol: Anthropic migration guide and
   release notes FIRST (platform.claude.com / code.claude.com docs), then
   community experience with CLAUDE.md style for the new model.
2. Update the relevant section of the config-onboarding skill's
   `references/model-guidance.md` (in the plugin repo, if writable — otherwise
   note it in `$STATE/research/`).
3. Propose a **minimal-diff retune** of the user's CLAUDE.md: structure and
   content stay exactly as-is; only model-specific instruction wording/style is
   adjusted to what the new model needs (e.g. removing self-verification
   imperatives a self-verifying model no longer needs). Show the diff; the
   user approves before anything is written.
4. Write via target-adapter, update `$STATE/models.json`, journal the
   migration with sources. Stop.

## 3. Audit the config

Audit the config (via target-adapter: the chezmoi source, or live `~/.claude`
in plain mode) against the evidence: unused agents/skills/hooks, model routing
vs actual model distribution in the report, friction events pointing at config
gaps, repeated prompts that should become commands/skills, token sinks.

Always include:
- **Supply-chain check**: for every enabled plugin and MCP server, verify
  provenance — is it the canonical repo (stars, activity, npm linkage)? A
  1-star unattributed clone once ran PreToolUse hooks on a machine for months
  before anyone checked.
- **Token safety**: never paste raw `claude mcp list` output into reports,
  journal, or chat — it prints server args including secrets. Name + status
  only (the miner already does this).
- Acceptance criteria for config changes check the managed SOURCE, not live
  state (see target-adapter).

## 4. Research

Research only what the audit + evidence surfaced — not generic "best
practices". Follow research-protocol (hierarchy, citations, contradictory
evidence). Persist non-trivial findings to `$STATE/research/<topic>.md`.

## 5. Update roadmap

Update `$STATE/roadmap.md`: candidates ranked by evidence strength —
friction events > miner numbers > community consensus > intuition. Every item
carries its sources and a pre-declared acceptance criterion. Present the
ranked candidates; the user picks ONE (recommend the top one).

## 6. Implement ONE improvement

Smallest reversible change that addresses it, written via target-adapter.

## 7. Validate + journal

- Validate against the acceptance criterion declared in the roadmap row.
- Append a journal entry to `$STATE/journal.md`: hypothesis, research (with
  sources), evidence, confidence, decision, lessons, failed/deferred ideas,
  future-automation candidates.
- Mark the roadmap row done. Commit per target-adapter rules.

Then STOP. One improvement per cycle.
