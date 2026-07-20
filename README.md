# pi-extensions

Extensions and packages for [pi](https://github.com/earendil-works/pi). Each subdirectory is its own installable pi package.

| Package | What it is |
| ------- | ---------- |
| [`lean/`](lean/) | Compact Claude-Code-style TUI: collapse every tool call to a single `▶` line (`/tools`, `ctrl+q`), a frameless one-line user message, no blank lines between blocks, and short dense prose (`/prose`). |
| [`voice/`](voice/) | Build a personal writing-voice corpus, distill it into a style guide, and draft new text in your voice. Skills: `/skill:voice`, `voice-init`, `voice-distill`, `voice-pull-emails`, `voice-pull-blog`. Port of the `my-voice` Claude Code plugin. |
| [`pets/`](pets/) | A switchable menagerie of coding-agent companions: ASCII-art characters with quips and matching themes, swapped with `/pet`, with an optional ever-present perch. |

## Install

Everything at once, into your pi:

```
make install
```

Auto-discovers every package in this repo (`make list` to see them). `make local` installs project-locally instead; `make test` runs each package's tests.

Or one at a time:

```
pi install /path/to/pi-extensions/pets -l
```

or, once pushed, by repo path:

```
pi install github.com/guygrigsby/pi-extensions/pets
```

Each package documents its own commands and setup in its `README.md`.
