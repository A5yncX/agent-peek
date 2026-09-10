# Changelog

## 0.5.0

### Added

- `/peek options` interactive settings menu.
- Direct settings commands: `confirm on|off` and `display window|conversation`.
- Centered Pi TUI result overlay, dismissible with Enter, Escape, or `q`.
- Persistent configuration keys `confirmBeforeSummary` and `resultDisplay`.

### Changed

- Pi result display now defaults to `window`; `conversation` remains available for durable TUI-only entries.
- Disabling the per-request AI summary confirmation requires an explicit safety confirmation because later summaries may upload filtered text and incur cost without another prompt.
- RPC automatically falls back to conversation output because it cannot render Pi overlays.
- The animated below-editor `👀` is removed before opening either result view.
- Failed AI summaries now show a short, credential-redacted provider error while retaining the local snapshot.

### Unchanged safety boundaries

- Target transcripts remain read-only.
- Overlay and conversation results do not enter model context.
- AI summaries still omit reasoning, images, tool arguments, and tool-result bodies.

## 0.4.1

- Added configurable Pi summary models.
- Added Pi, Claude Code, and Codex CLI adapters with shared working-session presence.
- Added English/Chinese interface selection and npm-token redaction.
