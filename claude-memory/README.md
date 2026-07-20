# claude-memory

Read-only. Injects the Claude Code **project** memory for the current working
directory (`~/.claude/projects/<cwd-slug>/memory/`: `MEMORY.md` plus every
`*.md` fact file) into the pi system prompt, wrapped in a guarded
`<memory-context readonly="true">` block so the model treats it as reference,
not instructions.

It never writes. No `/remember`, no save tool. Pi's own writable memory is a
separate extension (`pi-hermes-memory`).

Global memory (the user-wide `~/.claude/CLAUDE.md`) is loaded by the `pi`
launch wrapper, not by this extension.

Config: set `PI_CCMEM=off` to disable injection.
