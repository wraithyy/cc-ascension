# Model guidance — how each model wants its CLAUDE.md

Per-model knowledge for generating and retuning CLAUDE.md. Uniform sections so
a single model's guidance can be updated as one small commit.

> Maintenance: during /ascend research steps, re-verify any section whose
> `last-verified` is older than 90 days against docs.anthropic.com /
> code.claude.com before using it as a generation basis.

Cross-model facts (last-verified: 2026-08-03):
- One CLAUDE.md feeds all models — no per-model mechanism exists. Write for
  the user's PRIMARY model; note conflicts for secondary models.
  Source: code.claude.com/docs/en/memory.md (retrieved 2026-08-03)
- Keep CLAUDE.md under ~200 lines; move procedures to skills or path-scoped
  rules. Source: code.claude.com/docs/en/memory.md (retrieved 2026-08-03)
- Instruction-following budget is real: ~150-200 instructions total across
  CLAUDE.md + rules before adherence degrades; a 3,847-to-312-token community
  rewrite showed 91.9% context cut with no quality regression.
  Source: firecrawl.dev claude-code-token-efficiency; linas.substack.com/p/claudemd (retrieved 2026-08-03)

## Claude 5 generation (Fable 5, Opus 5, Sonnet 5) — shared style rules
last-verified: 2026-08-03

### CLAUDE.md style
- De-prescribe. "Prompts written for prior models are often too prescriptive
  and reduce output quality." `CRITICAL:/MUST/ALWAYS/If in doubt use X`
  overtriggers on 4.5+/5 models — soften or delete; do not add more guardrails.
  Source: platform.claude.com Claude 5 migration guide (retrieved 2026-08-03)
- Anthropic removed >80% of Claude Code's own system prompt for the 5
  generation with no eval loss — principles over step-by-step scaffolding.
  Source: claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models (retrieved 2026-08-03)
- DELETE behavioral self-check lines ("double-check your work", "use a
  subagent to verify") — 5-generation models self-verify. CAUTION: most
  "verify" lines in real configs are tool gates (`tsc`, `flutter analyze`,
  lint commands) — those are commands, not behavior, and must stay. Audit of
  74 real CLAUDE.md files found zero genuine self-check imperatives; blind
  grep-and-delete strips real gates.
  Source: paddo.dev claude-md-technical-debt (retrieved 2026-08-03)
- Don't re-add scope-discipline / no-narration rules — the Claude Code system
  prompt already carries them for 5-generation models.
  Source: huytieu.com (retrieved 2026-08-03)

## Fable 5 (Mythos-class)
last-verified: 2026-08-03

### CLAUDE.md style
- Delegation is dependable — encourage it with explicit WHEN-to-delegate
  guidance (thresholds), not step-by-step how.
- Remove old scaffolding; A/B any kept scaffolding against a version without it.
  Source: platform.claude.com migration guide (retrieved 2026-08-03)

### Cost/latency posture
- $10/$50 per MTok; 50%-of-weekly-limits cap even on Max subscriptions.
  Community consensus: wasteful as a daily driver (Opus 5 wins 7/8 coding
  evals at half the price); the pattern that survives is Fable as
  orchestrator/planner with execution in Sonnet/Haiku subagents.
  Source: claudefa.st/blog/models/model-selection; digitalapplied.com limits (retrieved 2026-08-03)

### Quirks
- Silent safety-classifier fallback Fable-to-Opus that sticks for the session.
- Org `availableModels` allowlist can silently drop `model: fable`.
  Source: mcp.directory fable-5 routing guide (retrieved 2026-08-03)

## Opus 5
last-verified: 2026-08-03

### CLAUDE.md style
- Self-verifies: delete verification instructions.
- Delegates MORE readily than 4.x — CAP delegation (explicit thresholds for
  when NOT to spawn subagents), the inverse of 4.x-era advice.
- Drop "high-severity only" filters from review prompts; add length guidance
  for deliverables; start effort at `high`, not `xhigh`.
  Source: platform.claude.com whats-new-opus-5 + migration guide (retrieved 2026-08-03)

### Cost/latency posture
- $5/$25 per MTok — same list price as Opus 4.8; default Opus in Claude Code
  since v2.1.219. Community consensus: "Opus 5 is the default, not the
  escalation." `opusplan` (Opus plans, Sonnet executes) is the built-in
  hybrid for subscription users; no `fableplan` exists.
  Source: code.claude.com/docs/en/model-config.md; claudefa.st (retrieved 2026-08-03)

## Sonnet 5
last-verified: 2026-08-03

### CLAUDE.md style
- Same 5-generation de-prescription rules as above; tolerates slightly more
  explicit structure than Opus/Fable without quality loss.

### Cost/latency posture
- $3/$15 per MTok; near-Opus on coding/agentic benchmarks. Community
  consensus subagent default: `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` (env var
  outranks per-agent frontmatter pins).
  Source: code.claude.com/docs/en/sub-agents.md; medium.com/@roanmonteiro (retrieved 2026-08-03)

## Haiku 4.5
last-verified: 2026-08-03

### CLAUDE.md style
- Terse imperative bullets work; keep instructions short, concrete,
  mechanical. Haiku follows explicit direction better than abstract principle.
- Scope: trivial/mechanical tasks only (file ops, formatting, narrow
  rule-checks); do not route reasoning work here.
  Source: claude-world.com model-selection-guide-2026 (retrieved 2026-08-03)

### Cost/latency posture
- $1/$5 per MTok, fastest tier.

## Gotchas that belong in generated configs (any model)
last-verified: 2026-08-03
- Mid-session model switch = uncached full-history re-read (cost spike).
- Per-agent `effort:` frontmatter (`low|medium|high|xhigh`) is often a better
  lever than a model downgrade for mechanical subagents.
  Source: code.claude.com/docs/en/sub-agents.md (retrieved 2026-08-03)
