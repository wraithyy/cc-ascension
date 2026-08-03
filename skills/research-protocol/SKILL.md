---
name: research-protocol
description: Mandatory sourcing rules for every cc-ascension recommendation. Load before generating config (config-onboarding) or proposing improvements (evolution-cycle).
---

# Research protocol — no unsourced recommendations

Every generated CLAUDE.md section, rule, settings change, plugin/MCP
suggestion, and evolution improvement must be backed by at least one cited
source. Training-data knowledge alone does not count — model behavior, Claude
Code features, and community consensus shift faster than any cutoff. Verify
live (WebSearch / WebFetch; `ctx_fetch_and_index` when the context-mode plugin
is available).

## Source hierarchy (for conflicts)

1. Official Anthropic docs (docs.anthropic.com, code.claude.com/docs, platform
   migration guides, claude.com engineering blog, release notes/changelog)
2. Maintainer statements (Anthropic engineers on GitHub/HN/X)
3. Widely-corroborated community experience (GitHub issues/discussions, public
   dotfiles/config repos, Reddit r/ClaudeAI + r/ClaudeCode, Hacker News)
4. Single blog post / Medium article / anecdote

When sources disagree, present the tradeoff to the user — never silently pick.
Collect contradictory evidence, not just confirmation. Treat X/Twitter
snippets you cannot fully fetch as unverified.

## Citation format

Inline, everywhere a claim lands:

    Source: <URL> (retrieved YYYY-MM-DD)

Required in: journal entries, roadmap items, reference docs, and the
"Rationale & sources" appendix of a generated config (the appendix lives in
`$STATE/journal.md` — never inside CLAUDE.md itself, where it would waste
context tokens forever).

## Freshness

- Reference docs (e.g. model-guidance.md) carry a `last-verified: YYYY-MM-DD`
  date per section.
- Any section older than 90 days must be re-verified against official docs
  before it is used as a basis for generating or retuning a config.

## Persistence

Research findings from evolution cycles go to `$STATE/research/<topic>.md`
(sources linked, dated, conclusion + confidence level) so later cycles build
on them instead of re-researching. Check that directory before starting new
research on a topic.
