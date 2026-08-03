# cc-ascension

Evidence-driven evolution for your Claude Code configuration.

Instead of copying someone else's dotfiles, cc-ascension:

1. **Interviews you** about your workflow and generates a config tailored to
   your stack and your primary model — CLAUDE.md written the way that model
   actually needs it (`/cc-ascension:setup`).
2. **Evolves it** from evidence: mines your own session transcripts, collects
   friction events you log, researches solutions (official docs first, then
   community), and proposes ONE small reversible improvement per cycle
   (`/cc-ascension:ascend`).
3. **Tracks model changes**: when a new model generation appears in your
   sessions, it researches the migration guide and proposes a minimal retune
   of your CLAUDE.md — structure untouched, only model-specific wording.

Every recommendation is research-backed and cited. No unsourced "best
practices".

## Install

```
/plugin marketplace add wraithyy/cc-ascension
/plugin install cc-ascension@cc-ascension
```

## Commands

| Command | What |
|---|---|
| `/cc-ascension:setup` | onboarding interview → generated CLAUDE.md + rules + settings proposal |
| `/cc-ascension:ascend` | one evolution cycle (evidence → research → one improvement → journal) |
| `/cc-ascension:friction <text>` | log a moment of workflow pain as evidence for future cycles |

## How your config is managed

- If **chezmoi** manages `~/.claude`, edits go to the chezmoi source and are
  applied — never to live files (live-state fixes get reverted by the next
  apply; the plugin knows this the hard way).
- Otherwise edits go to `~/.claude` directly, with an offered `git init` so
  every improvement is one revertable commit. Setup will recommend chezmoi
  once, and never require it.

## State

Everything personal lives in `~/.claude/evolution/` (journal, roadmap,
friction log, mining reports, research notes) — never in this plugin, never
published. Mining reports contain your project names; they are gitignored by
default and marked "do not publish".

Transcript history older than ~30 days is pruned by Claude Code; run
`scripts/install-backup.sh` (launchd on macOS, cron on Linux) if you want a
long-term mirror for mining.

## Zero-friction tip

`/cc-ascension:friction` is long to type. Add a personal alias command, e.g.
`~/.claude/commands/f.md` containing one line: run `/cc-ascension:friction`
with my arguments.
