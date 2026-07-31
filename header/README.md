# header

Replaces pi's built-in startup header (logo + keybinding hints) with a framed
two-column box: greeting, block π and session facts on the left, tips and the
release's headlines on the right.

```
╭─ pi v0.83.0 ──────────────────────────────────┬──────────────────────────────────────────────────────────────────────╮
│                afternoon, Guy                 │ Tips for getting started                                             │
│                                               │ /model switches model mid-session                                    │
│                 ████████████                  │ /tree browses this session's branches                                │
│                  ██     ██                    │                                                                      │
│                  ██     ██                    │ ──────────────────────────────────────────────────────────────────── │
│                  ██     ██                    │ What's new in 0.83.0                                                 │
│                  ██     ██▄                   │ Credential export for external clients                               │
│                                               │ Headless OpenRouter sign-in                                          │
│                kimi-k3 · high                 │                                                                      │
│           ~/projects/pi-extensions            │ /changelog for more                                                  │
╰───────────────────────────────────────────────┴──────────────────────────────────────────────────────────────────────╯
```

The greeting name is resolved once at startup from, in order: `PI_HEADER_NAME`,
git `user.name`, then the OS username — first token, capitalized. What's new is
read from the installed pi's `CHANGELOG.md` and drops out silently if that read
fails. Tips rotate by the day.

The frame, title and π are the only colored parts, and they take
`PI_HEADER_COLOR` rather than a theme token — brand color in one place, so the
theme itself can stay neutral. Everything inside the box uses theme colors.

Widths adapt: the box caps at 120 columns rather than stretching, stacks to one
column below 80, and falls back to the plain glyph-and-greeting header below 46.

Requires `quietStartup: false` in your settings. `setHeader` is a no-op when the
built-in header is silenced, so with `quietStartup: true` you would see nothing.

## Install

```
pi install npm:@guygrigsby/pi-header
```

## Config

- `PI_HEADER_NAME` — name used in the greeting (else git `user.name`, else OS user).
- `PI_HEADER_COLOR` — frame, title and π as `#rrggbb` (default `#ff4fa3`). Anything
  that isn't a hex color falls back to the theme's `accent`.

## Test

```
npm test
```

Covers the pure layout and parsing in `extensions/header-core.mjs`: column
fitting, frame drawing, changelog extraction, path shortening. The `setHeader`
wiring is exercised by running pi.
