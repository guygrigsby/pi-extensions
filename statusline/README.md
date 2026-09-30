# pi-statusline

One-line footer for the [pi coding agent](https://github.com/earendil-works/pi): which model, which repo, which branch. Replaces the built-in token/context block.

```
 aperture-completions:z-ai/glm-5.3  pi-extensions   main
```

## Install

```
pi install npm:@guygrigsby/pi-statusline
```

## What it shows

| Segment | Source |
| ------- | ------ |
|  `provider:model` | `ctx.model` — the live model, so `/model` mid-session updates the line |
| repo name | basename of `ctx.cwd`, the checkout directory |
|  branch | the footer data provider's git branch, which watches `.git/HEAD` itself |

The colon between provider and model is deliberate: model ids routinely contain slashes (`z-ai/glm-5.3`), so a slash separator would be ambiguous.

In a narrow terminal the line degrades in order: the repo name goes first, then the branch, then the model label is trimmed. The model is the last thing standing — it is the only segment never fully dropped.

| Control | Effect |
| ------- | ------ |
| `PI_STATUSLINE` | `off` → leave pi's built-in footer alone |

## Why registration is deferred a tick

pi hands the footer data provider (git branch, extension statuses) only to a `setFooter` factory. An extension that wants it without owning the footer briefly installs a throwaway one and then calls `setFooter(undefined)` — restoring the built-in footer. `status-sweeper` does exactly that, so a footer installed during the same `session_start` can be wiped by it depending on package load order.

Registering from a `setTimeout(…, 0)` lands after every synchronous `session_start` handler, so this footer stays installed whichever order the packages load in.

## Test

```
npm test
```

Covers the pure composition logic (`extensions/statusline-core.mjs`): label and repo extraction, segment order, width degradation, colors per segment. The pi event wiring is exercised by running pi.
