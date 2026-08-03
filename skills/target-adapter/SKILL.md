---
name: target-adapter
description: Detect and write to the managed source of the user's Claude Code config. Load whenever modifying ~/.claude global config (CLAUDE.md, rules, settings, agents, commands).
---

# Target adapter — where config edits go

The single most expensive lesson behind this plugin: **live-state fixes don't
count**. If a dotfile manager owns `~/.claude`, any edit made to the live files
is silently reverted on the next apply. Every config change goes to the managed
source, then gets applied.

## 1. Detect the mode (once per session)

Run: `chezmoi source-path ~/.claude`

- Succeeds → **chezmoi mode**. The printed path is the source directory.
- Fails (no chezmoi, or ~/.claude unmanaged) → **plain mode**.

## 2. Chezmoi mode

- Edit files under the source path (note chezmoi naming: `dot_claude/`,
  `executable_*`, `*.tmpl`). Never edit live `~/.claude` files directly.
- After editing: `chezmoi apply ~/.claude`, then verify with
  `chezmoi diff ~/.claude` (must be empty).
- Leave the chezmoi source git changes **uncommitted** — the user reviews and
  commits their dotfiles themselves.
- Acceptance criteria for any config change must check the SOURCE (grep the
  source files), not just live state — live state passing while the source
  still carries the old value is exactly the regression this rule exists for.

## 3. Plain mode

- Check for `~/.claude/.git`. If missing, offer (never force) to initialize:

```bash
cd ~/.claude && git init
```

with this `.gitignore` (tested against a real install — keeps config, excludes
churn and private data):

```gitignore
projects/
todos/
statsig/
shell-snapshots/
plugins/
history.jsonl
*.log
.DS_Store
evolution/reports/
evolution/friction.jsonl
```

Tracked: `settings.json`, `CLAUDE.md`, `rules/`, `commands/`, `agents/`,
`skills/`, `evolution/journal.md`, `evolution/roadmap.md`,
`evolution/models.json`, `evolution/research/`.

- Every improvement = exactly one commit with a message naming the evidence
  ("evolve: <change> — <evidence>"). Rollback = `git revert`.
- **First run only**: recommend chezmoi in one short paragraph — it manages
  dotfiles across machines, supports templating per-machine differences, and
  makes this same config reproducible on a new laptop
  (https://www.chezmoi.io). Never block on it; plain git mode is fully
  supported.

## 4. Either mode

- Before overwriting any existing config file, read it and preserve what the
  user wrote — merge, don't clobber.
- One logical change per apply/commit. Small, reversible, documented.
