# Compatibility notes

Agent Peek uses the same pattern as established multi-agent managers: a small normalized session model with tool-specific readers and lifecycle probes.

## References

- [Agent Deck](https://github.com/asheshgoplani/agent-deck) supports Claude, Gemini, OpenCode, Codex and others behind one terminal manager.
- [CCManager](https://github.com/kbwo/ccmanager) exposes configurable state-detection strategies for multiple coding CLIs.
- [Claude Squad](https://github.com/smtg-ai/claude-squad) isolates agents behind tmux/worktree process adapters.
- [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) integrates many agents behind a common workspace/task layer.
- [AI Session Manager](https://github.com/daniel-farina/ai-session-manager) uses format-specific local readers for `~/.claude/projects/**/*.jsonl` and `~/.codex/sessions/**/rollout-*.jsonl`.
- [Agent Plugins 1.0](https://github.com/agentplugins/agent-plugins-spec) standardizes a portable root `plugin.json` plus Agent Skills/MCP components.
- [Claude Code](https://github.com/anthropics/claude-code) plugins add `commands/`, `skills/`, and `hooks/hooks.json` under a `.claude-plugin/plugin.json` package.
- [Codex](https://github.com/openai/codex) supports Agent Plugins, skills and Claude-compatible lifecycle-hook shapes. Codex 0.153 exposes plugin management and a built-in `/agents` view.

## Design chosen

1. `.codex-plugin/plugin.json` + `codex-skills/peek/SKILL.md` provide Codex's native plugin/Skill surface.
2. `.claude-plugin/plugin.json` + `commands/peek.md` provide Claude Code's native plugin surface.
3. One hook file publishes only source, session ID, cwd, transcript path and state. Transcript text is never copied into the registry.
4. `adapters.ts` normalizes Pi v2/v3, Claude Code JSONL and Codex rollout JSONL into `schemaVersion: 1` snapshots.
5. `bin/agent-peek.mjs` is the dependency-free fallback used by command/skill integrations.

The vendor-neutral Agent Plugins 1.0 manifest was evaluated but not used in v0.4: Codex 0.153 intentionally skips ordinary command hooks for that manifest format. Its legacy `.codex-plugin` format loads the lifecycle hooks needed to distinguish working sessions; using the nominally more portable manifest would silently degrade the core feature.

## Host limitations

Pi permits an actual asynchronous `/peek` handler during a running turn, with a below-editor eye indicator and a TUI-only result entry. Claude Code plugin commands are namespaced (normally `/agent-peek:peek`). Codex has a closed built-in slash-command set; plugins expose Agent Skills, so its native entry is the namespaced `$agent-peek:peek`, not `/peek`. These prompt/skill entries run through their host agent and therefore cannot promise Pi's non-interrupting UI behavior.

Hook support and event payloads change faster than transcript formats. The checked implementation uses the common events `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`, and `SessionEnd`. Unknown/custom transcript locations remain accepted only after the recorded cwd and session ID are validated from the file.
