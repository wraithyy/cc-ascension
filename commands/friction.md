---
description: Log a workflow friction event to the cc-ascension evidence store
---

Log a friction event — a moment of workflow pain the user wants remembered as
evidence for future config evolution. Argument: free-text description of the
pain. If empty, ask one short question: "What hurt?" (in the user's language).

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/friction.mjs" "<the description>"
```

Rules:
- Store the user's text verbatim; do not editorialize or expand it.
- Confirm with a single short line, then return to whatever was in progress.
