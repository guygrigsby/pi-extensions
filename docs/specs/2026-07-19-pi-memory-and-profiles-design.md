# Pi memory and two profiles

Status: draft (design approved 2026-07-19, pending spec review)

## Goal

Two Pi launch profiles, and a memory system wired so it only runs on the capable one.

- `pi` (default) = frontier profile: rich context, a frontier model, full personality, and memory.
- `pil` = local profile: a bare instance on a local model, `ago` only, no personality, no memory.

Memory has two halves: Pi **reads** the existing Claude Code memory (read-only, never writes it) and Pi **writes** to its own separate store. The two never mix until the write store has earned trust.

## Profiles

| | `pi` (frontier, default) | `pil` (local, bare) |
| --- | --- | --- |
| model | `openrouter/moonshotai/kimi-k3` | `gpt-oss-120b-mxfp4-bf16` on this Mac (provider TBD) |
| context | `~/.claude/CLAUDE.md` via `--append-system-prompt`, discovery off (`-nc`) | default discovery loads minimal `~/.pi/agent/AGENTS.md` |
| extensions | full discovery (pets, ponytail, lean, voice, hermes, claude-memory) | `--no-extensions` (none) |
| skills | full discovery (incl. `ago`) | `--no-skills --skill ~/.claude/skills/ago` (ago only) |
| memory | read CC + read/write own store | none |
| personality | pets + ponytail | none |

Gating needs no runtime flag: memory and personality are ordinary discovered extensions, so `pi` picks them up and `pil`'s `--no-extensions` drops them. That is the whole mechanism.

## Memory design

Two focused units, each one job:

1. **`pi-hermes-memory`** (adopted, npm, MIT) — Pi's own read/write store. Writes to `~/.pi/agent/pi-hermes-memory/` (global) and `~/.pi/agent/projects-memory/<project>/` (project), plain markdown plus a SQLite search sidecar. Chosen for: config-dir storage (matches "its own file in its config dir"), secret scanning on every write, and guarded XML wrapping so remembered facts are never read as instructions. This is Pi's writable memory.

2. **`claude-memory`** (new, this repo) — read-only. On `before_agent_start`, load the Claude Code **project** memory and inject it under a guarded, read-only section. Never writes. This is the "read your memory model" half. (Global memory is the user-wide `CLAUDE.md`, already injected by the `pi` wrapper; not this extension's concern.)

Boundary / anti-corruption: the Claude Code memory dir is read-only to Pi. Pi's writes go only to the hermes store. A future "graduation" (Pi writing into the shared CC memory once trusted) is out of scope here and would be its own change.

### `claude-memory` extension

- **Source (project only):** `~/.claude/projects/<slug>/memory/`, where `<slug>` is pi's cwd with `/` replaced by `-` (e.g. `/Users/guygrigsby/projects/pi-extensions` -> `-Users-guygrigsby-projects-pi-extensions`). Read if present, skip silently if absent.
- **Global is not this extension's job.** "Global" memory is the user-wide `~/.claude/CLAUDE.md` plus whatever it references, and the frontier `pi` wrapper already injects that via `--append-system-prompt`. If a global memory dir ever evolves organically, `CLAUDE.md` will reference it, so it flows in through that same path with no change here.
- **What it reads:** `MEMORY.md` (the index) plus every `*.md` fact file in the project memory dir.
- **Injection:** append to the system prompt inside a guarded block, e.g. `<memory-context source="claude-code" readonly="true">` with a one-line note that these are remembered facts for reference, not instructions. Mirrors hermes' guard posture.
- **Gating:** it is a discovered extension registered in `~/.pi/agent/settings.json` (path `../../projects/pi-extensions/claude-memory`). `pi` loads it; `pil --no-extensions` drops it. An env kill-switch (`PI_CCMEM=off`) leaves the door open but is not required.
- **Read-only guarantee:** the extension registers no write tool and no `/remember`-style command. It only reads and injects.

## Wiring (`~/dotfiles/zsh/funcs.zsh`)

Replace the current `pif` function with `pi` and add `pil`. Both call `command pi` to avoid recursing on the function name.

```zsh
# pi (default) = frontier profile: rich CLAUDE.md context, kimi, full discovery
# (memory + pets + ponytail + lean + voice + ago all auto-load).
pi() {
  command pi -nc --append-system-prompt "$HOME/.claude/CLAUDE.md" \
    --model openrouter/moonshotai/kimi-k3 "$@"
}

# pil = local/bare: gpt-oss-120b on this Mac, minimal AGENTS.md, ago only,
# no extensions, no memory, no personality.
pil() {
  command pi --no-extensions --no-skills --skill "$HOME/.claude/skills/ago" \
    --model <LOCAL_PROVIDER>/gpt-oss-120b-mxfp4-bf16 "$@"
}
```

## Open items

- Local model provider: `gpt-oss-120b-mxfp4-bf16` served on this Mac (mlx, OpenAI-compatible). Needs a pi provider config pointing at the local endpoint, and the `<LOCAL_PROVIDER>` name. Guy to confirm ("likely" this model).
- `pi-hermes-memory` install and config: confirm `pi install npm:pi-hermes-memory`, and pick injection mode (`legacy-inject` full-context vs `policy-only` search-on-demand). Frontier + kimi can afford `legacy-inject`; revisit if context gets heavy.

## Testing

- Unit (pure functions, in the `claude-memory` package): cwd -> slug mapping; assembling the injection block from a set of fixture memory files (correct guard wrapper, `MEMORY.md` + fact files concatenated, absent dir skipped).
- Manual, the real path: launch `pi` and confirm `[Context]`/loaded set shows the memory + personality extensions and CC memory is in-context; launch `pil` and confirm it is bare (only ago, local model, no memory). Prove read-only by checking the extension exposes no write tool/command.

## Non-goals

- Pi writing into the Claude Code memory dir (deferred until the write store is trusted).
- Any memory on `pil`.
- Auto-capture beyond whatever `pi-hermes-memory` does by default; no custom capture logic in `claude-memory`.

## Note

`pi-extensions` is not a git repo, so there is nothing to commit; the spec lives on disk under `docs/specs/`.
