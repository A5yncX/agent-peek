# Changelog

## 0.5.0

### Reading and presentation

- Added local-only, call-paired file-change paths, shell exit codes, test summaries and short errors for Pi, Claude and Codex; these fields never enter AI requests or upload previews.
- Prioritized current work and recent local records; omitted unsupported completion, progress, ETA and blocker fields, and retained warnings in variable-height cards.
- Prioritized meaningful model evidence within a 10,000-character budget and compacted request JSON; preserved default AI behavior and complete bounded file reads.
- Added a synthetic local-read benchmark and privacy/adapter regression checks.

- Fixed mismatched panel backgrounds: inherit terminal colors like pi-mcp-adapter rather than painting `customMessageBg`; validate overlay accents against Pi's OSC 11 background query with a bounded timeout and default-color fallback.

- Unified Pi overlays and conversation cards with aligned labels, restrained emphasis and theme-aware borders.
- Wrapped long fields with Unicode-aware terminal sizing; added scrolling and a visible range in short overlays.
- Added localized lookup and cancel hints; disabled animation in dumb terminals.
- Refined native settings labels and interactive CLI output while preserving plain piped output.
- Reorganized both READMEs around an illustrative preview and quick start.
- Reused Pi's TUI peer utilities for text measurement, wrapping and keyboard decoding; development and CI now install peers before testing.

### Added

- `/peek options` interactive settings menu.
- Direct settings commands: `confirm on|off` and `display window|conversation`.
- Centered Pi TUI result overlay, dismissible with Enter, Escape, or `q`.
- Evidence-cited model estimates for progress percentage, confidence, ETA, completed work, and estimation basis.
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
- Progress and ETA remain unknown when fewer than two meaningful progress signals exist; liveness or elapsed time alone is insufficient.

## 0.4.1

- Added configurable Pi summary models.
- Added Pi, Claude Code, and Codex CLI adapters with shared working-session presence.
- Added English/Chinese interface selection and npm-token redaction.
