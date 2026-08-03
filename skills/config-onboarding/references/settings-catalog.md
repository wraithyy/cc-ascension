# Settings + plugin/MCP recommendation catalog

Menu the onboarding picks from — NEVER recommend all of it. 3-5 suggestions
matched to the interview, each with a one-line rationale and source.
last-verified: 2026-08-03

## settings.json keys worth proposing

| Key | When | Note |
|---|---|---|
| `model` | always | alias per interview: `opusplan` (subscription hybrid), `opus`, `sonnet`, `fable`, `haiku` |
| `effortLevel` | Opus/Fable users | start `high`, not `xhigh` (Opus 5 guidance) |
| `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` (env) | users with custom agents | one env var beats N frontmatter pins; outranks frontmatter |
| `statusLine` | cost-sensitive users | visibility of model/context burn |

Source: code.claude.com/docs/en/{model-config,settings,sub-agents}.md (retrieved 2026-08-03)

## Plugins / MCP by interview signal

| Signal | Suggestion | Rationale |
|---|---|---|
| uses libraries/frameworks heavily | context7 plugin | current library docs beat training data; official marketplace |
| frontend work | playwright or chrome-devtools MCP | live browser verification of changes |
| GitHub team | gh CLI (no MCP needed) | built-in support in Claude Code |
| GitLab team | gitlab MCP | MR/issue workflow from the session; put tokens in env vars, never in command args (they leak into transcripts via `claude mcp list`) |
| long sessions / big repos | context-mode plugin (mksglu/context-mode — verify canonical repo, clones exist) | sandboxed research keeps raw output out of context |
| recurring multi-step prompts found by miner | project-level commands/ | cheaper than plugins for team-shared prompts |

Supply-chain rule (from evolution-cycle audit): before recommending any
plugin/MCP, verify provenance — canonical repo, stars/activity. A 1-star
unattributed clone once ran hooks for months on the author's machine.

## Permissions posture

Match the interview's autonomy answer: conservative default (review
everything) for new users; suggest `/fewer-permission-prompts`-style
allowlists only after the user reports prompt fatigue (that is friction —
log it, let /ascend propose the allowlist with evidence).
