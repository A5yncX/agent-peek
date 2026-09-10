---
description: Inspect a working agent session in this directory; use "language" to toggle English/Chinese
argument-hint: "[language [en|zh] | session-id-prefix]"
allowed-tools: ["Bash(node:*)"]
---

Run Agent Peek without continuing or modifying the inspected task.

- If `$ARGUMENTS` starts with `language`, run:
  `node "${CLAUDE_PLUGIN_ROOT}/bin/agent-peek.mjs" peek language` followed only by a validated `en` or `zh` argument when present.
- Otherwise run:
  `node "${CLAUDE_PLUGIN_ROOT}/bin/agent-peek.mjs" peek --self "${CLAUDE_SESSION_ID}"` followed only by an optional session ID prefix containing letters, numbers, or hyphens.

Return the command's stdout verbatim, with no summary, tools, follow-up task, or extra commentary. If multiple sessions are listed, ask the user to rerun this command with one displayed ID prefix.
