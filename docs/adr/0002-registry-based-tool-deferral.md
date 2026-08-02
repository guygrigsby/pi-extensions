# 2. Defer tool registration from the live registry, not an env var

Status: Accepted (2026-08-01). Supersedes the coordination mechanism of [ADR 1](0001-tool-render-ownership.md); the per-tool ownership split itself stands.

## Context

ADR 1 split tool-row ownership per tool: `PI_LEAN_SKIP=edit,write` told `lean`
to leave those tools to `pi-tool-display`. Its Consequences section noted the
risk plainly: two extensions must agree about a tool without talking to each
other, the coupling is a shell variable plus a JSON file, and nothing validates
that they agree.

That bit within a day. The variable lived in the `pi` wrapper in
`dotfiles/zsh/funcs.zsh`; a terminal session started before that change carried
the old wrapper, ran `pi` without the variable, and pi refused to start at all:

```
Error: Failed to load extension ".../lean/extensions/index.ts": Tool "edit" conflicts with .../pi-tool-display/index.ts
```

pi's duplicate-tool check runs once, after all extensions load, over each
extension's load-time registrations. A conflict rejects the whole extension.
So the env-var handshake had no failure mode gentler than pi not starting.

`pi-tool-display` never needed the handshake: before registering an override it
calls `pi.getAllTools()` and backs off when the tool is already owned by
something that is not the built-in. It registers at load anyway only because
`getAllTools` is unavailable until the session binds.

## Decision

`lean` mirrors that check from the other side. `lean-tools` registers nothing at
load; on `session_start` (post-bind, when `getAllTools` works and the
duplicate-tool check is already past) it registers only the tools whose current
owner is the built-in. A tool another extension registered — `pi-tool-display`'s
`edit`/`write` — is deferred to automatically.

The deferred names join a shared `leftAlone` set (seeded from `PI_LEAN_SKIP`,
which remains as a manual override) that `lean-anytool` consults, so the rows
handed to another renderer are not then folded flat by the render patch.

Tools `lean` itself registered re-register unconditionally on later
`session_start`s: the ownership check cannot tell "another extension owns this"
from "we registered it last session", and re-registering refreshes the cwd baked
into the tool factories.

## Consequences

The two configs can no longer disagree. Turning a tool on in `pi-tool-display`'s
`registerToolOverrides` is the whole configuration; `lean` observes the result
in the registry and backs off. The `pil` profile, which loads `lean` without
`pi-tool-display`, sees every tool built-in-owned and takes all seven — the env
var never needed to vary per profile again.

Load order matters but only for who wins, never for whether pi starts:
whichever of the two extensions registers first owns the tool, and the other
defers. In the current settings `pi-tool-display` loads before `lean` and
registers at load, so it wins the tools its config claims.

Pre-bind history rendering (the first paint of a resumed transcript) falls to
whatever is registered before `session_start` — the built-in renderer for the
tools `lean` will claim. Rows re-render leaned once registration lands.
