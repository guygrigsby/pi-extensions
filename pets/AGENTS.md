# pets (pi package)

A switchable set of coding-agent character companions for pi. Each pet has ASCII art, quips, a soul (personality), and a generated theme. `/pet` switches them; an optional perch keeps one ever-present in the TUI; `/pet soul` channels the pet's persona into the agent's tone.

## Build pipeline

```
pets/<name>.md  --(npm run gen)-->  generated/pets.json  (data + soul, runtime reads this)
                                \->  themes/<name>.json   (full pi theme, from palette)
```

The `.md` is the single source of truth. `generated/` and `themes/` are built — never hand-edit; regenerate.

## Layout

- `pets/*.md` — the characters. YAML frontmatter (`name`, `display`, `subtitle`, `emoji`, `art`, `taglines`, `palette`) + a markdown body that is the pet's soul. Edit these.
- `generated/pets.json` — built bundle: every pet object plus its `soul` string. Read at runtime.
- `themes/*.json` — full 51-token pi themes, generated from each pet's compact `palette`.
- `extensions/pets-core.mjs` — pure, dependency-free logic: `loadPets`, `renderBanner`, `renderPerch`, `pickTagline`, `readState`/`writeState`, `expandTheme`. Unit-tested.
- `extensions/pets.ts` — the pi glue. `session_start` paints header (`setHeader`), badge (`setStatus`), and perch (`setWidget`). `before_agent_start` injects the soul when channeling is on. `agent_end` triggers chatter. Registers `/pet`. Persists `{ pet, perch, soul }` to `~/.pi/agent/pets.json`. Switches theme via `ctx.ui.setTheme(name)`.
- `scripts/gen.mjs` — parses `pets/*.md` (via `yaml`, a devDependency), writes the bundle and themes. Exports `parsePetMarkdown`/`loadPetSources` for tests.
- `tests/pets-core.test.mjs` — `node --test`.

## Design

- **Pets are data, code is fixed.** Adding a pet = one `.md` + `npm run gen`. No code change.
- **Markdown source, JSON runtime.** Humans edit `.md` (frontmatter + soul prose); the generator emits JSON the runtime reads. YAML parsing stays in the generator so the runtime is dependency-free.
- **One palette, generated theme.** A pet carries ~13 compact colors; `expandTheme` derives the full token set (backgrounds, syntax, thinking borders), detecting light vs dark from `bg`.
- **Soul is tone-only.** The injection framing tells the model to let the persona color phrasing, not reasoning or correctness. Opt-in via `/pet soul`, off by default.
- **Chatter is event-first, clock-second.** Speaks on `agent_end`; the 60s idle timer only swaps the widget line, never calls the model. Timer is `unref`'d and cleared on `session_shutdown`.
- **Decoupled theme.** The extension paints with theme tokens only; `/pet` additionally switches to the pet's own theme.

## Regenerating after edits

```
npm run gen    # rebuild generated/ + themes/ from pets/*.md
npm test       # verify
```
