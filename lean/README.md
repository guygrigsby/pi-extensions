# pi-lean

Compact TUI for the [pi coding agent](https://github.com/earendil-works/pi): collapse every tool call to a single line, shrink the user message to a tinted one-liner, strip the blank lines between blocks, and keep the agent's prose short and dense. Independent extensions in one package, plus a theme built for them.

```
[term]   git status            Ran shell command
[book]   compiler.go           Read
[pencil] parser.go             Edited (+8 -2)
[search] SemanticEditProtocol  Searched
```

## Install

```
pi install npm:@guygrigsby/pi-lean
```

## `lean-tools` — one line per tool

pi's built-in tool blocks render a full colored shell (the green/red box). This strips the shell and folds each completed call to a single line: a Nerd Font icon per operation, the command muted to its left, then a minimal past-tense summary (edits show `(+A -B)`, failures show why). The icon identifies the tool (`pencil` for edit, `book` for read, `terminal` for bash, `magnifier` for grep, `folder` for find, `list` for ls, `floppy` for write), and the command is truncated so the summary never gets pushed off a narrow terminal. Running calls stream live so you still see activity.

| Control | Effect |
| ------- | ------ |
| `ctrl+q` | cycle folded → expanded → hidden |
| `/tools [mode]` | set `folded` \| `expanded` \| `hidden` directly (cycles with no arg) |
| `ctrl+o` | (built-in) expand a row's output |
| `PI_LEAN_MODE` | startup mode: `folded` (default) \| `expanded` \| `hidden` |
| `PI_LEAN_SKIP` | tools to force-skip, e.g. `edit,write` (default: none) |

It takes over the built-in tool rendering (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) — but per tool, and only where nothing else got there first. Registration happens at `session_start`, after asking the live registry (`pi.getAllTools`) who owns each tool: one already registered by another extension is left to it, automatically. No coordination config, no conflict error.

The case this exists for is edits: folding a diff to one line hides the only part worth seeing. Turn on `registerToolOverrides.edit` and `.write` in [`pi-tool-display`](https://www.npmjs.com/package/pi-tool-display)'s `config.json` (its other entries `false`) and lean backs off those two: syntax-highlighted diffs with row fills and word-level emphasis for edits, one-line folds for everything else. Run without `pi-tool-display` and lean takes all seven. Deferred tools are also exempt from `lean-anytool`'s fold, so the other renderer's row survives whole. See [ADR 2](../docs/adr/0002-registry-based-tool-deferral.md).

`PI_LEAN_SKIP` remains as a manual override: named tools are never registered by lean, falling to whatever else claims them or pi's built-in rendering.

Expand is keyboard-driven (`ctrl+q` all rows, `ctrl+o` a row's output). Per-row **click**-to-expand isn't offered: pi never enables terminal mouse reporting and exposes no mouse events or row hit-testing to extensions, so clicks belong to your terminal (text selection), not pi. Clickable rows would need an upstream pi change.

## `lean-usermsg` — thin user message

pi's default user message wraps its text in a Box with a hardcoded `paddingY: 1` — a blank tinted line above and below, so a one-word message is three lines tall. This zeroes that padding: a single tinted line, no frame. It patches a pi core internal (`UserMessageComponent.prototype.rebuild`), guarded so a pi update degrades to the stock render instead of crashing.

| Control | Effect |
| ------- | ------ |
| `PI_LEAN_USERMSG` | `off` → leave pi's padded default alone |

Pairs with `pi-tool-display`'s `enableNativeUserMessageBox: false` (drop its framed box) and a distinct `userMessageBg` in your theme for the tint.

## `lean-spacing` — no blank lines between blocks

`AssistantMessageComponent` interleaves its content with `Spacer(1)` (one blank line) before the text, between each tool call, and around notices — the vertical gap between folded rows and around turns. There's no setting for it. This drops those spacers (the structural ones only; markdown paragraph breaks are untouched). Same guarded core patch as `lean-usermsg`.

| Control | Effect |
| ------- | ------ |
| `PI_LEAN_SPACING` | `off` → leave pi's default spaced transcript alone |

Maximally tight by design. If turns end up too cramped, set `PI_LEAN_SPACING=off`.

## `lean-prose` — short, dense output

Appends a terseness layer to the system prompt: lead with the answer, cut preamble and filler, prefer a phrase to a sentence. Tone and length only — never trades away correctness or completeness of the work.

| Control | Effect |
| ------- | ------ |
| `/prose` | toggle on/off (persists) |
| `/prose on` \| `/prose off` | set directly |
| `PI_LEAN_PROSE` | startup default: `on` (default) \| `off` |

State persists to `$PI_CODING_AGENT_DIR/lean-prose.json`.

## `neutral-hue` — a theme for this look

`themes/neutral-hue.json`, offered by the package and selected with `"theme": "neutral-hue"` in your settings or `/settings`.

Neutral dark grays for prose, hue only where it separates structure: purple keywords, blue functions, green strings, teal types, orange numbers, lavender inline code. pi paints the whole tool block's background from two tokens; this theme keeps success invisible (terminal background) and reserves a fill for failures:

| Token | Value | What it paints |
| ----- | ----- | -------------- |
| `toolSuccessBg` | terminal default | success-block background (no fill) |
| `toolErrorBg` | `#3a1f26` | error-block background |

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
