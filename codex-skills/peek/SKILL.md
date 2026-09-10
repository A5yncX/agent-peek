---
name: peek
description: Inspect the concise status of another working Pi, Claude Code, or Codex CLI session in the current directory. Use when the user invokes $agent-peek:peek or asks to peek at agent progress. Also handles "language", "language en", and "language zh".
---

Run the bundled local CLI once and return stdout verbatim. Do not inspect logs yourself, continue the other task, or summarize the result again.

1. Resolve this skill directory, then locate `../../bin/agent-peek.mjs` relative to it.
2. For `language [en|zh]`, run `node <script> peek language [en|zh]`.
3. Otherwise run `node <script> peek --self "$CODEX_SESSION_ID" [session-id-prefix]`; only pass a prefix containing letters, numbers, or hyphens.
4. If multiple sessions are listed, ask the user to invoke `$agent-peek:peek <prefix>` with one displayed ID prefix.

The command reads local, bounded transcript projections. Never print raw transcript contents or tool-result bodies.
