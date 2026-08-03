---
name: config-onboarding
description: Interview the user about their workflow and generate a tailored, model-aware Claude Code configuration. Invoked by /cc-ascension:setup.
---

# Config onboarding

Goal: a config built for THIS user's workflow and THEIR primary model — not a
copy of anyone's dotfiles. Load `target-adapter` and `research-protocol`
first. `$STATE` = `$CC_ASCENSION_STATE` or `~/.claude/evolution`.

## 1. Preflight

- Detect the write target via target-adapter (this is also where the one-time
  chezmoi recommendation happens in plain mode).
- If `~/.claude/CLAUDE.md` (or the managed source equivalent) already exists,
  read it and ask: merge (preserve their content, restructure around it) or
  fresh start (archive the old file first)? Never silently overwrite.

## 2. Interview (in the user's language, ~10 minutes)

Ask in small batches (AskUserQuestion where available), not one giant form:

1. Stack: languages, frameworks, main project types.
2. Solo or team? Code review culture? Commit conventions that matter?
3. Which model do they run daily (Haiku / Sonnet / Opus / Fable / opusplan)?
   Subscription (which tier) or API billing?
4. Top 3 current annoyances with Claude Code (verbatim — these seed friction).
5. Verbosity preference: terse answers or explanatory?
6. Autonomy tolerance: auto-accept edits, or review everything?

Don't ask what you can detect: current model (`settings.json`), OS, installed
plugins, MCP servers — read those instead.

## 3. Ground in model guidance

- Read `references/model-guidance.md` — the section for the user's primary
  model. Per research-protocol: if the section's `last-verified` is older than
  90 days, re-verify against official docs before using it.
- Research the user's specific stack/pain points live (official docs first,
  then community) where the references don't cover them.

## 4. Generate (show, then write)

- **CLAUDE.md** — structured per `references/claude-md-patterns.md`, styled
  per the model-guidance section (e.g. terse imperative bullets for Haiku;
  principles + delegation thresholds for Opus/Fable; no self-verification
  imperatives for models that self-verify). Under 200 lines. Only content
  grounded in the interview — no speculative sections.
- **rules/*.md** — one file per stated pain point that a standing rule
  actually fixes. No pain point, no rule.
- **settings.json** — proposed as a diff, shown to the user, never silently
  applied (model choice, effort level, statusline, permissions).
- **Plugin/MCP suggestions** — 3 to 5, each one line of rationale + source,
  matched to the stack (per `references/settings-catalog.md`).

Every generated item cites its source per research-protocol. The full
"Rationale & sources" appendix goes into the genesis journal entry, NOT into
CLAUDE.md.

## 5. Write + seed state

- Write config via target-adapter (one commit: "genesis: cc-ascension setup").
- Seed `$STATE/`: `journal.md` (genesis entry: interview summary, what was
  generated, rationale & sources appendix), empty `roadmap.md`,
  `models.json` — `{"models": [...], "acknowledged": "YYYY-MM-DD"}` listing
  the model IDs the config was generated for (baseline for the /ascend
  migration check).

## 6. What NOT to generate

No agent libraries, no skill collections, no hook suites. Those emerge from
/cc-ascension:ascend cycles backed by the user's own usage evidence. Tell the
user this explicitly — it's the product's core idea: the config grows from
evidence, not from templates.
