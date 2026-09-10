# Agent Peek

**Inspect concise progress from working Pi, Claude Code, and Codex CLI sessions in the same directory.**

[简体中文](README.zh-CN.md) · [Changelog](CHANGELOG.md) · [Compatibility research](docs/compatibility.md)

[![CI](https://github.com/A5yncX/agent-peek/actions/workflows/test.yml/badge.svg)](https://github.com/A5yncX/agent-peek/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933.svg)](https://nodejs.org/)

## Native entry points

| Host | Install | Invoke |
| --- | --- | --- |
| Pi | `pi install npm:@asyncx/agent-peek` then `/reload` in each Pi window | `/peek` |
| Claude Code | `/plugin marketplace add A5yncX/agent-peek` then `/plugin install agent-peek@agent-peek-local` | `/agent-peek:peek` |
| Codex CLI 0.153+ | `codex plugin marketplace add A5yncX/agent-peek` then `codex plugin add agent-peek@agent-peek-local` | `$agent-peek:peek` |
| Shell | `npm install -g @asyncx/agent-peek` | `agent-peek` |

Git installs are also supported: `pi install git:github.com/A5yncX/agent-peek`.

Restart Claude Code/Codex after installation so their lifecycle hooks start. Hosts may ask you to trust the local hooks. Review them first: plugins run with your user permissions.

Claude namespaces plugin commands, and Codex plugins expose namespaced Agent Skills rather than arbitrary slash commands. Those hosts therefore cannot provide a literal bare `/peek`;  see [host limitations](docs/compatibility.md#host-limitations). Pi remains the only implementation that can run `/peek` asynchronously during the current agent turn.

## Language

English is the default. The preference is shared through `~/.agent-peek/config.json`:

- Pi: `/peek language`, `/peek language en`, `/peek language zh`
- Claude Code: `/agent-peek:peek language [en|zh]`
- Codex: `$agent-peek:peek language [en|zh]`
- Shell: `agent-peek language [en|zh]` (no argument toggles)

## Summary model

Pi's optional AI summary can use a dedicated model without switching the current session model. Edit `~/.agent-peek/config.json`:

```json
{
  "language": "en",
  "model": "my-provider/fast-model",
  "confirmBeforeSummary": true,
  "resultDisplay": "window"
}
```

The model format is `provider/model-id`. Changes apply on the next `/peek` without `/reload`. Remove `model` to follow Pi's current model. If the configured model is unavailable, Agent Peek shows the local snapshot instead of silently falling back. Claude Code, Codex, and shell entry points remain deterministic and do not call this model.

## Pi options

Run `/peek options` for the interactive settings menu, or set values directly:

```text
/peek options confirm on
/peek options confirm off
/peek options display window
/peek options display conversation
```

| Option | Default | Behavior |
| --- | --- | --- |
| `confirmBeforeSummary` | `true` | Ask before each filtered model upload. Turning it off through the command requires one explicit safety confirmation. |
| `resultDisplay` | `"window"` | Show a centered, dismissible overlay. `"conversation"` appends a durable TUI-only custom entry instead. |

The result window closes with Enter, Escape, or `q`. RPC cannot render overlays and automatically falls back to conversation output. Window mode does not persist the result in the transcript; conversation entries remain excluded from model context.

### New in 0.5.0

- Added the `/peek options` menu and direct option arguments.
- Added explicit confirmation before disabling future summary prompts.
- Added evidence-cited model estimates for progress, confidence, ETA, completed work, and estimation basis.
- Changed Pi's default result display from a conversation entry to a centered overlay inspired by `pi-mcp-adapter` panels.
- Preserved conversation mode for durable results and RPC fallback.
- Kept the below-editor animated `👀` indicator during lookup; it is removed before either result view opens.

## Routing

1. In Pi, a working current session wins.
2. Otherwise one working session in the same canonical cwd is selected directly.
3. Pi opens a picker for multiple sessions. Claude/Codex/shell list IDs for a second invocation with a prefix.
4. Idle, confirmation-waiting, expired, dead, and historical sessions are excluded from automatic routing.

Every instrumented host writes a small heartbeat under `~/.agent-peek/`. It contains source, session ID, cwd, transcript path, PID and state—never transcript text. Hooks mark prompts/tools as working, permission requests as waiting, Stop as idle, and SessionEnd as ended. A sidecar refreshes every five seconds while the host PID exists; records older than twenty seconds are ignored.

## Output

```text
╭─ 👁 Agent Peek
│ Other session · ● Working · codex · 10:20:30 snapshot
│ Goal  Compare four extraction models
│ Current  Testing the third model
│ Done  Two model combinations completed
│ Progress  ██████░░░░ 60% · estimated · medium confidence
│ ETA  ~15 min–35 min
│ Blocker  Not confirmed
│ Basis  2/4 recorded; third stage active; 28 minutes elapsed
╰─ Enter / Esc / q: close
```

The AI summary may estimate progress from at least two meaningful signals: explicit completed/total counts, checklist state, ordered stages, timestamped progress changes, and elapsed task time. ETA requires observed pace or comparable completed units. Process liveness, elapsed time alone, ordinary fractions, scores, and token usage are insufficient. Every estimate is labelled with confidence and a short basis; without enough evidence it remains unknown.

`/peek local` never asks a model to estimate. It displays only explicit recorded counts, otherwise unknown. Recorded counts and model estimates are evidence-based approximations, not independently verified runtime facts.

In Pi, `👀` animates below the editor while lookup runs, then disappears. The result opens in the configured window or conversation view. Claude/Codex use their native command/skill working UI and return the shared CLI output.

Pi extras: `/peek self`, `/peek local`, `/peek refresh`, `/peek preview`, `/peek options`, `/peek cancel`, `/peek clear`, and `/peek <id-prefix>`.

## Privacy and limits

- Target transcripts are read-only. Agent Peek does not resume, repair, migrate, control, or message the target agent.
- Runtime state and preferences stay under `~/.agent-peek/`, outside this repository. Session files, local configuration, credentials, and generated summaries are excluded from the published package.
- Pi's optional AI summary asks for consent by default; disabling that prompt requires explicit confirmation and can incur charges without another prompt. Reasoning, images, tool arguments and tool-result bodies are removed; text can still contain secrets. Claude/Codex/shell use local deterministic extraction and do not upload another model call.
- Readers validate cwd/session identity and bound input to 64 MiB/file, 8 MiB/line and 100,000 normalized entries. Pi v2/v3, Claude Code JSONL, and Codex rollout JSONL are supported.
- Foreign formats are version-sensitive. Unknown records are skipped; malformed ancestry disables recorded numeric progress. Model estimates use bounded, cited evidence and may still be wrong. Liveness proves only that a host process exists, not that useful progress is occurring.
- TUI colors use Pi theme tokens only after 4.5:1 RGB contrast verification; otherwise output falls back to bold. Status never relies on color alone.

Report security issues using [`SECURITY.md`](SECURITY.md); never attach a real transcript or credential to a public issue.

## Development

```sh
git clone https://github.com/A5yncX/agent-peek.git
cd agent-peek
npm run check
```

Tests use Node's built-in runner with synthetic transcripts—no API key or transcript upload. Optional Pi hot-reload integration runs when `PI_PEEK_LOADER` points to Pi's `dist/core/extensions/loader.js`. A local Codex 0.153 marketplace/install smoke check passed; Claude CLI was not installed in the development environment, so its manifest/hooks are fixture-validated but still require a real-host smoke test before release.
