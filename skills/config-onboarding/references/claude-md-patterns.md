# CLAUDE.md structure patterns

Generic structure for generated CLAUDE.md files, independent of model.
last-verified: 2026-08-03

## Layering — what goes where

| Layer | Content | Loaded |
|---|---|---|
| CLAUDE.md | identity/role, conventions, delegation thresholds, pointers | every session |
| rules/*.md (imported or path-scoped) | standing policies per concern | every session — keep few |
| skills | procedures, checklists, reference knowledge | on demand |
| commands | repeated multi-step prompts | on demand |

Rule of thumb: if it is a PROCEDURE (steps), it is a skill or command. If it
is a POLICY (always true), it may be CLAUDE.md/rules — but only if the user
actually hits the situation. Source: code.claude.com/docs/en/memory.md
(retrieved 2026-08-03)

## Generated CLAUDE.md skeleton (< 200 lines total)

1. **Role** (2-4 lines) — how the user wants Claude to act (orchestrator,
   pair programmer, reviewer...). From interview.
2. **Stack + conventions** (bullets) — languages, frameworks, commit format,
   naming. Only what deviates from ecosystem defaults; Claude knows the
   defaults.
3. **Model routing** (only if the user delegates) — which tier for what, per
   model-guidance.md posture.
4. **Workflow preferences** — verbosity, autonomy/review expectations,
   test-first or not. From interview answers only.
5. **Pointers** — one-liners to rules/skills instead of inlined content.

## Anti-patterns (do not generate)

- Speculative sections "for later" — no evidence, no section.
- Restating Claude Code system-prompt behavior (scope discipline, no
  narration, concise output) — already there. Source: huytieu.com (retrieved 2026-08-03)
- Walls of MUST/ALWAYS/CRITICAL — see model-guidance de-prescription rules.
- Copying another person's config wholesale — instruction budget is too tight
  for someone else's habits.
- Rationale/citations inside CLAUDE.md — they belong in the journal genesis
  entry; CLAUDE.md pays context tax every session.
