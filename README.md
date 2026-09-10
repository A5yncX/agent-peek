<div align="center">

# Agent Peek

**A quiet glance at your working agents.**

Pi · Claude Code · Codex CLI

Read-only progress snapshots. One directory. No context switching.

</div>

[简体中文](README.zh-CN.md) · [Changelog](CHANGELOG.md) · [Compatibility research](docs/compatibility.md)

[![CI](https://github.com/A5yncX/agent-peek/actions/workflows/test.yml/badge.svg)](https://github.com/A5yncX/agent-peek/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/@asyncx/agent-peek?logo=npm)](https://www.npmjs.com/package/@asyncx/agent-peek)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933.svg)](https://nodejs.org/)

## At a glance

```text
╭ Agent Peek ───────────────────────────────────────────────────────╮
│ Other session · ● Working · codex · 10:20:30 snapshot              │
│                                                                  │
│ Goal      Compare four extraction models                         │
│ Current   Testing the third model                                │
│ Recent · local  src/model.ts · result recorded                    │
│ Recent · local  bash · result recorded · # pass 12 · # fail 0      │
│ Done      Two model combinations completed                       │
│                                                                  │
│ Progress  ██████░░░░ 60% · estimated · medium confidence           │
│ ETA       ~15 min–35 min                                          │
│ Basis     2/4 recorded; third stage active; 28 minutes elapsed     │
│ Enter / Esc / q: close                                            │
╰──────────────────────────────────────────────────────────────────╯
```

*Illustrative snapshot, not live session data. Panels inherit your terminal background, like pi-mcp-adapter.*

| Glance | Understand | Stay in control |
| --- | --- | --- |
| Current work and completed steps | Recorded progress or labelled AI estimates | Read-only access; model uploads ask first by default |

[Install](#native-entry-points) · [Configure](#pi-options) · [How it works](#routing) · [Privacy](#privacy-and-limits)

## Quick start · Pi

```sh
pi install npm:@asyncx/agent-peek
```

Then run `/reload` in each Pi window and `/peek` to inspect progress. Use `/peek local` for a snapshot without an AI call.

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

Long fields wrap instead of disappearing at the edge. In short terminals, use ↑/↓, Page Up/Page Down, or Home/End to scroll; the footer shows the visible range. The result window closes with Enter, Escape, or `q`. RPC cannot render overlays and automatically falls back to conversation output. Window mode does not persist the result in the transcript; conversation entries remain excluded from model context.

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

Window and conversation views prioritize the current task, up to three recent local tool results, and known waiting/blocker states. Recognized file-change calls show paths; shell results can show recorded exit codes, test counts and short errors. A recorded tool result is not proof the task is complete, and a recent error is not automatically an unresolved blocker. Missing done/progress/ETA/blocker fields are omitted rather than filling the card with “unknown”. Only the title and current work are emphasized. The CLI uses aligned labels in interactive terminals and keeps redirected output plain and unframed.

The AI summary may estimate progress from at least two meaningful signals: explicit completed/total counts, checklist state, ordered stages, timestamped progress changes, and elapsed task time. ETA requires observed pace or comparable completed units. Process liveness, elapsed time alone, ordinary fractions, scores, and token usage are insufficient. Every estimate is labelled with confidence and a short basis; without enough evidence the corresponding field is omitted.

`/peek local` never asks a model to estimate. It displays local tool facts and explicit recorded counts; unsupported estimates are omitted. Recorded counts and model estimates are evidence-based approximations, not independently verified runtime facts.

In Pi, `👀` animates below the editor alongside a localized lookup label and `/peek cancel` hint, then disappears. `TERM=dumb` disables the animation. The result opens in the configured window or conversation view. Claude/Codex use their native command/skill working UI and return the shared CLI output.

Pi extras: `/peek self`, `/peek local`, `/peek refresh`, `/peek preview`, `/peek options`, `/peek cancel`, `/peek clear`, and `/peek <id-prefix>`.

## Privacy and limits

- Target transcripts are read-only. Agent Peek does not resume, repair, migrate, control, or message the target agent.
- Runtime state and preferences stay under `~/.agent-peek/`, outside this repository. Session files, local configuration, credentials, and generated summaries are excluded from the published package.
- Pi's optional AI summary asks for consent by default; disabling that prompt requires explicit confirmation and can incur charges without another prompt. Reasoning, images, tool arguments and tool-result bodies are removed from model input; text can still contain secrets. Local-only paths and diagnostic snippets are displayed separately and excluded from both model requests and `/peek preview`. Extraction inspects bounded output tails, not complete logs, and may miss unsupported tool formats. Conversation mode persists these local facts in the selected Pi transcript. Claude/Codex/shell use local deterministic extraction and do not upload another model call.
- Readers validate cwd/session identity and bound input to 64 MiB/file, 8 MiB/line and 100,000 normalized entries. Pi v2/v3, Claude Code JSONL, and Codex rollout JSONL are supported.
- Foreign formats are version-sensitive. Unknown records are skipped; malformed ancestry disables recorded numeric progress. Model estimates use bounded, cited evidence and may still be wrong. Liveness proves only that a host process exists, not that useful progress is occurring.
- Panels never paint Pi's `customMessageBg`: background and body text inherit the terminal palette. Overlays read the actual background through Pi's OSC 11 API (150 ms timeout) and only use theme accents that pass 4.5:1 contrast. Unsupported terminals and conversation cards keep default terminal colors. Theme invalidation triggers a fresh query; `NO_COLOR` disables accent colors and querying. Weight, spacing, symbols and text preserve hierarchy without color.

Report security issues using [`SECURITY.md`](SECURITY.md); never attach a real transcript or credential to a public issue.

### Reading and latency

AI remains the default when a model is available and consent is granted. Evidence selection now prioritizes the latest request and substantive assistant text over empty tool-result records; the evidence JSON budget is 10,000 characters (previously 16,000). Model payloads use compact JSON; preview stays formatted. Files still receive a full bounded read to preserve branch and identity checks—no stale snapshot cache or unsafe tail-only reads.

Run `node test/bench-read.mjs` for a synthetic 16 MiB read benchmark. This measures local parsing only, not model response time.

## Development

```sh
git clone https://github.com/A5yncX/agent-peek.git
cd agent-peek
npm install
npm run check
```

Tests use Node's built-in runner with synthetic transcripts—no API key or transcript upload. Optional Pi hot-reload integration runs when `PI_PEEK_LOADER` points to Pi's `dist/core/extensions/loader.js`. A local Codex 0.153 marketplace/install smoke check passed; Claude CLI was not installed in the development environment, so its manifest/hooks are fixture-validated but still require a real-host smoke test before release.
