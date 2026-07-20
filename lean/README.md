# pi-lean

Compact TUI for the [pi coding agent](https://github.com/earendil-works/pi): collapse every tool call to a single line, shrink the user message to a tinted one-liner, strip the blank lines between blocks, and keep the agent's prose short and dense. Four independent extensions in one package.

```
▶ bash   git status
▶ read   compiler.go
▶ edit   parser.go (+8 -2)
▶ grep   SemanticEditProtocol
```

## `lean-tools` — one line per tool

pi's built-in tool blocks render a full colored shell (the green/red box). This strips the shell and folds each completed call to a single `▶` line: tool, target, and a minimal summary (edits show `(+A -B)`, failures show why, everything else stays bare). Running calls stream live so you still see activity.

| Control | Effect |
| ------- | ------ |
| `ctrl+q` | cycle folded → expanded → hidden |
| `/tools [mode]` | set `folded` \| `expanded` \| `hidden` directly (cycles with no arg) |
| `ctrl+o` | (built-in) expand a row's output |
| `PI_LEAN_MODE` | startup mode: `folded` (default) \| `expanded` \| `hidden` |

Expand is keyboard-driven (`ctrl+q` all rows, `ctrl+o` a row's output). Per-row **click**-to-expand isn't offered: pi never enables terminal mouse reporting and exposes no mouse events or row hit-testing to extensions, so clicks belong to your terminal (text selection), not pi. Clickable rows would need an upstream pi change.

## `lean-usermsg` — thin user message

pi's default user message wraps its text in a Box with a hardcoded `paddingY: 1` — a blank tinted line above and below, so a one-word message is three lines tall. This zeroes that padding: a single tinted line, no frame. It patches a pi core internal (`UserMessageComponent.prototype.rebuild`), guarded so a pi update degrades to the stock render instead of crashing.

| Control | Effect |
| ------- | ------ |
| `PI_LEAN_USERMSG` | `off` → leave pi's padded default alone |

Pairs with `pi-tool-display`'s `enableNativeUserMessageBox: false` (drop its framed box) and a distinct `userMessageBg` in your theme for the tint.

## `lean-spacing` — no blank lines between blocks

`AssistantMessageComponent` interleaves its content with `Spacer(1)` (one blank line) before the text, between each tool call, and around notices — the vertical gap between folded `▶` rows and around turns. There's no setting for it. This drops those spacers (the structural ones only; markdown paragraph breaks are untouched). Same guarded core patch as `lean-usermsg`.

| Control | Effect |
| ------- | ------ |
| `PI_LEAN_SPACING` | `off` → leave pi's default spaced transcript alone |

Maximally tight by design. If turns end up too cramped, set `PI_LEAN_SPACING=off`.

It **owns** the built-in tool rendering (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`), so it conflicts with any other extension that re-registers those tools. Do not run it alongside `pi-foldable-tools`, or alongside `pi-tool-display` with its `registerToolOverrides` on. `pi-tool-display` pairs fine if you set every `registerToolOverrides` entry to `false` (keeps its native user-message box and thinking labels; hands tool rendering to lean).

## `lean-prose` — short, dense output

Appends a terseness layer to the system prompt: lead with the answer, cut preamble and filler, prefer a phrase to a sentence. Tone and length only — never trades away correctness or completeness of the work.

| Control | Effect |
| ------- | ------ |
| `/prose` | toggle on/off (persists) |
| `/prose on` \| `/prose off` | set directly |
| `PI_LEAN_PROSE` | startup default: `on` (default) \| `off` |

State persists to `$PI_CODING_AGENT_DIR/lean-prose.json`.

## Install

```
pi install /path/to/pi-extensions/lean
```

Then `/reload` or restart pi.

## Test

```
npm test
```

Covers the pure line-formatting logic (`extensions/lean-tools-core.mjs`). The TUI rendering wiring is exercised by running pi.

## Credit

`lean-tools` adapts the tool re-registration + `renderShell: "self"` approach from [`pi-foldable-tools`](https://www.npmjs.com/package/pi-foldable-tools) (MIT, earendil-works), tightened from a 2-line card to a single line.
