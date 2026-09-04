# pi-extensions

Extensions and packages for [pi](https://github.com/earendil-works/pi). Each subdirectory is its own installable pi package.

| Package | What it is |
| ------- | ---------- |
| [`active-model/`](active-model/) | Inject a live call-out of the currently-active model into the system prompt each turn, so the orchestrator knows which model it is running and can route accordingly. |
| [`claude-aliases/`](claude-aliases/) | Claude-Code-style slash commands for pi: `/exit` and `/clear`. |
| [`claude-memory/`](claude-memory/) | Read-only: inject the Claude Code project memory (`MEMORY.md` and fact files) into a pi session's context. Never writes. |
| [`header/`](header/) | Replace pi's startup header with a framed two-column box: block π and greeting beside tips and what's new. |
| [`image-paste/`](image-paste/) | Paste images from the Mac clipboard into pi running on a remote machine over ssh. A launchd socket service serves the clipboard image, an ssh `RemoteForward` carries it and the extension attaches it on `ctrl+v` like a native paste. |
| [`lean/`](lean/) | Compact Claude-Code-style TUI: collapse every tool call to a single `▶` line (`/tools`, `ctrl+q`), a frameless one-line user message, no blank lines between blocks, and short dense prose (`/prose`). `PI_LEAN_SKIP=edit,write` keeps the fold everywhere but edits, where a syntax-highlighted diff belongs. Ships the `neutral-hue` theme. |
| [`pets/`](pets/) | A switchable menagerie of coding-agent companions: ASCII-art characters with quips and matching themes, swapped with `/pet`, with an optional ever-present perch. |
| [`promptdump/`](promptdump/) | Dev tool: on every provider request, dump the exact payload pi sends (final system prompt plus messages) to a file so you can see precisely what the model receives. |
| [`session/`](session/) | Stamp every provider request with `X-Pi-Session-Id` (the session UUID) and an enriched `User-Agent` carrying pi version, OS and distro, so an aperture proxy can group calls into sessions. |
| [`status-sweeper/`](status-sweeper/) | Keep pi's footer status line empty by clearing every extension-pushed status, whichever extension set it. |
| [`subagent-routing/`](subagent-routing/) | Inject a subagent model-routing policy: the orchestrator plans and judges on its own live model and fans implementation out across a price-tiered ladder of every configured model, steered by a cost/performance mode, reviewing before it accepts. |
| [`voice/`](voice/) | Build a personal writing-voice corpus, distill it into a style guide, and draft new text in your voice. Skills: `/skill:voice`, `voice-init`, `voice-distill`, `voice-pull-emails`, `voice-pull-blog`. Port of the `my-voice` Claude Code plugin. |

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
