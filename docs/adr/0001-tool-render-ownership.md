# 1. Split tool-row ownership instead of one renderer owning everything

Status: Accepted (2026-07-31)

## Context

`lean` renders tool rows two ways. `lean-tools` re-registers the seven built-ins
(`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) with `renderShell: "self"`
and folds each to one line. `lean-anytool` patches `ToolExecutionComponent.render`
so every *other* tool, from any extension, folds the same way. Between them,
nothing in the transcript is more than a line unless expanded.

That is right for `bash` and `grep`, where the interesting part is that the call
happened. It is wrong for `edit`, where the diff is the content: folding it means
the change is invisible until `ctrl+o`, and even then `lean` painted it flat
green and red with no syntax highlighting.

`pi-tool-display` already solves the edit case properly: per-line `highlightCode`
over the theme's `syntax*` tokens, row background fill from `toolSuccessBg` and
`toolErrorBg`, word-level emphasis spans, a line-number gutter, unified or split
layout. It is a solved problem with about 1600 lines behind it.

The two extensions could not previously coexist on a tool. Both register the same
name, so the last registration wins, and `pi-tool-display` deliberately backs off
when it finds a built-in already owned by something else.

## Decision

Ownership is per tool, not per extension. `PI_LEAN_SKIP` names the tools `lean`
leaves alone; those rows belong to whatever else registers them.

Both halves of `lean` honor the same list. `lean-tools` does not register a
skipped tool, and `lean-anytool` does not fold a skipped tool's row. Missing the
second half is silent and total: the row renders correctly and is then collapsed
to one line by the patch, which looks exactly like the setting having no effect.

The default is empty, so an install that says nothing behaves as it did before.

## Consequences

Guy's setup runs `PI_LEAN_SKIP=edit,write` with `registerToolOverrides.edit` and
`.write` on in `pi-tool-display`: one-line folds for the noisy tools,
syntax-highlighted diffs for the two where the content matters.

Splitting ownership means two extensions must agree about a tool without talking
to each other, and the coupling is a shell variable plus a JSON file. Nothing
validates that they agree. Setting `PI_LEAN_SKIP=edit` without turning on
`pi-tool-display`'s override falls back to pi's own edit rendering, which is
fine, just not what was wanted. A typo in the list is caught and reported at
session start; a mismatch between the two configs is not.

Diff appearance now depends on theme tokens `lean` does not control, since the
row backgrounds come from `toolSuccessBg` and `toolErrorBg`. A theme that leaves
those near the terminal background gets a diff with no visible fill.
