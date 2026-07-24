# status-sweeper

pi renders a line at the bottom of the screen whenever any extension pushes a
status via `ctx.ui.setStatus(key, text)` (for example, ponytail's `🐴` badge).
This clears every such key, whichever extension set it, so that line never
shows — without touching pi's own footer (model, tokens, git branch).

How it reaches every key: the only public handle to the live status map is the
`footerData` passed to a `setFooter()` factory. The extension registers a
throwaway footer to capture that provider, immediately restores the built-in
footer, then deletes each key via the documented `setStatus(key, undefined)`.
Sweeps run deferred after `session_start` / `agent_start` / `agent_end` (so it
lands after whatever set the status) plus a 1s interval as the catch-all.

It keeps the other extension's behavior intact — only the status line is
suppressed.

## Install

```
pi install npm:@guygrigsby/pi-status-sweeper
```

## Config

- `PI_STATUS_SWEEPER` — set to `off` to leave the extension-status line alone.
