# Reference

Details that back the [README](../README.md). Everything here is implementation
truth — if a claim disagrees with the code, file a bug.

## Contents

- [What it touches](#what-it-touches)
- [Privacy details](#privacy-details)
- [State directory layout](#state-directory-layout)
- [How your config is managed](#how-your-config-is-managed)
- [Undo](#undo)
- [Mining report reference](#mining-report-reference)
- [Troubleshooting](#troubleshooting)
- [For teams](#for-teams)
- [FAQ](#faq)

## What it touches

- **Reads**: `~/.claude/projects/*.jsonl` (your session transcripts),
  `~/.claude/plugins/installed_plugins.json`, chezmoi source files if chezmoi
  manages `~/.claude`.
- **Writes**: `~/.claude/evolution/` (see [layout](#state-directory-layout));
  one config edit per `/ascend` cycle — always shown first.
- **Runs**: `claude mcp list`, `chezmoi source-path`/`diff` (if present),
  `git init` (offered, never forced), `rsync` + launchd/cron only if you opt
  into `scripts/install-backup.sh`.
- **Network**: `/ascend` and `/setup` do live web research to cite docs and
  migration guides — that is the only thing that leaves your machine. Mining
  and friction logging are fully local. Your transcripts are never transmitted.

## Privacy details

Full disclosure of what each artifact contains and how it's protected:

- **Mining reports** (`reports/*.md`) contain your project names, prompt
  prefixes (first 60 chars, normalized), and session file names. They are
  gitignored by the offered `.gitignore` and marked "do not publish" — that
  gitignore, not a promise, is the privacy mechanism.
- **Report sidecars** (`reports/*.json`) contain only counts (models, tools,
  agents, friction) plus health-finding strings, which can include file paths
  and plugin/marketplace names. No prompt text.
- **Friction log** (`friction.jsonl`) stores your free-text description plus
  the absolute working directory (`cwd`) at the time of logging — useful for
  attributing pain to a project, but it does reveal paths and your username.
  Gitignored like the reports.
- **Backup mirror** (`install-backup.sh`) copies full transcripts — which can
  contain anything you ever pasted into a session, including secrets — to the
  backup dir. The script `chmod 700`s the destination; keep it on a disk you
  control and exclude it from cloud sync if that matters to you.
- **Web research** sends search queries and fetches public pages. The
  research-protocol skill instructs the model to never include transcript
  content or project names in queries — like all skill instructions this is
  behavioral, not code-enforced.

## State directory layout

`$CC_ASCENSION_STATE`, default `~/.claude/evolution/`:

| Path | What | Written by |
|---|---|---|
| `journal.md` | one entry per cycle: hypothesis, evidence, decision, sources | `/ascend` |
| `roadmap.md` | ranked improvement candidates, one in-progress at a time | `/ascend` |
| `friction.jsonl` | your logged pain points (one JSON line each) | `/friction` |
| `models.json` | last-acknowledged model set (migration detection baseline) | `/setup`, `/ascend` |
| `reports/YYYY-MM-DD.md` | human mining report | `mine.mjs` |
| `reports/YYYY-MM-DD.json` | counts sidecar, next cycle's delta baseline | `mine.mjs` |
| `research/*.md` | per-topic research notes with citations | `/ascend` |

Delete the whole directory to reset all mined state; the plugin itself is
untouched.

## How your config is managed

- **chezmoi manages `~/.claude`** → edits go to the chezmoi source, then
  `chezmoi apply`. Live files are never edited directly (they'd be reverted
  by the next apply).
- **No chezmoi** → edits go to `~/.claude` with an offered `git init`, so
  every improvement is one `git revert` away. Setup recommends chezmoi once,
  never requires it.

## Undo

- Any `/ascend` change: `git revert` the commit (in `~/.claude` or your
  chezmoi source).
- Uninstall: `/plugin uninstall cc-ascension` removes the plugin; delete
  `~/.claude/evolution/` to remove all mined state. Nothing else is left.
- Backup job: `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.cc-ascension-backup.plist`
  (macOS) or remove the `cc-ascension-backup` line via `crontab -e` (Linux).

## Mining report reference

`node scripts/mine.mjs [flags]` (run from the plugin root, or via the path the
`/ascend` skill uses: `${CLAUDE_PLUGIN_ROOT}/scripts/mine.mjs`).

| Flag | Effect |
|---|---|
| `--days N` | only sessions modified in the last N days (default: all) |
| `--src DIR` | transcript root (default `~/.claude/projects`; point at a backup mirror for >30d history) |
| `--state DIR` | state dir for reports (default `$CC_ASCENSION_STATE` or `~/.claude/evolution`) |
| `--no-health` | skip config health checks (tests / machines without `claude`/`chezmoi`) |
| `--exclude-project N` | exclude a project from prompt stats (repeatable) |

Report sections:

- **Delta since last report** — diffed against the previous run's JSON
  sidecar: new models, new agent types, tool usage shifts ≥±20%, new and
  resolved health findings.
- **Config health** — MCP server status/duplicates, dead marketplace sources,
  secret-looking strings in MCP configs (never prints the value), plugin
  provenance vs chezmoi source, chezmoi drift.
- **Friction candidates (mined)** — tool errors by tool, permission denials
  by kind, user interrupts, retry loops (same tool ≥3× in a row with ≥1
  error). Weaker signal than explicit `/friction` entries.
- **Usage tables** — models with token counts and list-price cost estimates
  (unknown model names are flagged, not silently priced), projects, tools,
  subagent types, subagent messages by model, repeated prompts (scripted/
  headless sessions excluded: SDK entrypoint or <5s median prompt bursts),
  longest sessions.

Test the miner: `node --test scripts/mine.test.mjs` from the repo root
(synthetic fixtures, no host state needed).

## Troubleshooting

- **`/ascend` says the plugin cache is stale** — the installed plugin is a
  frozen copy that only refreshes on a version bump. Run
  `claude plugin update --scope <scope> cc-ascension@cc-ascension` (from the
  project dir for `local` scope), restart Claude Code, re-run `/ascend`.
- **Commands missing after install/update** — slash commands load at session
  start; restart the session.
- **`chezmoi diff` not empty after apply** — something else edited the live
  file since apply, or a template rendered differently. Inspect
  `chezmoi diff ~/.claude` before the next cycle; don't let `/ascend` write
  on top of unexplained drift.
- **Miner report shows "SKIPPED (chezmoi not detected)"** — expected on
  machines without chezmoi; the remaining health checks still run.
- **Oldest transcript is recent** — local history was pruned (~30 days);
  install the backup mirror and mine with `--src`.

## For teams

cc-ascension is per-developer — it tunes your personal `~/.claude`, keyed to
your own sessions and model. Rollout to a team = each dev installs the plugin
and runs `/cc-ascension:setup` individually. Treat `~/.claude/evolution/` as
private; never check it into a shared repo.

## FAQ

**How often should I run `/ascend`?** No fixed cadence — run it when friction
has accumulated. Weekly is a fine default.

**Does it change things automatically?** No. Every write is shown first
(diffs for settings and CLAUDE.md retunes, ranked candidates for
improvements); you approve, it applies exactly one change, then stops.

**What if I already have a CLAUDE.md?** `/setup` detects it and asks whether
to merge or start fresh — it never overwrites silently.

**What if I run `/ascend` before `/setup`?** It notices the missing state and
offers `/setup` first (or seeds empty files if you insist).

**Is any of my data sent anywhere?** No — see
[Privacy details](#privacy-details) for exactly what each artifact contains.

**`/cc-ascension:friction` is long to type.** Add a personal alias command,
e.g. `~/.claude/commands/f.md` that forwards its arguments to it.
