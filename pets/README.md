# pets (pi package)

A switchable menagerie of coding-agent companions for [pi](https://github.com/earendil-works/pi). Each pet is a character with a soul: ASCII art, quips, a personality, and a matching theme. `/pet` swaps them, an optional perch keeps your pet ever-present in the TUI where it says things, and `/pet soul` lets a pet color the agent's tone.

```
  ,___,       N Y X                 /\_/\      S P R O C K E T
  (o,o)       night-owl coding     ( ^.^ )     lazy-genius fox
  /)_)        "nocturnal by...      > ~ <      "ship it, then nap"
   " "                               ^ ^
```

## Install

```
pi install npm:@guygrigsby/pi-pets
```

## The roster

| Pet        | Who                    | Palette                  |
| ---------- | ---------------------- | ------------------------ |
| `nyx` 🌙   | night-owl coding agent | purple / cyan synthwave  |
| `sprocket` 🦊 | lazy-genius fox     | amber / rust sunset      |
| `bolt` 👾  | 8-bit code goblin      | phosphor-green CRT       |
| `marlo` 🍄 | cozy code sprite       | moss / cream cottagecore |
| `pixel` 🐈 | glitch cyber-cat       | hotpink / cyan vaporwave |
| `ember` 🐉 | clean-code dragon      | gold / crimson           |
| `grumble` 🐻 | grumpy cave bear     | slate / ember            |
| `sol` 🦎   | sunbathing gecko       | warm light theme         |

Each has a full character sheet (its "soul"). Read one with `/pet bio`.

## Install

```
pi install github.com/guygrigsby/pi-extensions/pets
```

Or from a local checkout:

```
pi install /path/to/pi-extensions/pets -l
```

## Commands

| Command        | What it does                                              |
| -------------- | -------------------------------------------------------- |
| `/pet`         | Show the active pet and list the rest.                   |
| `/pet <name>`  | Switch to a pet (also switches to its theme).            |
| `/pet next`    | Cycle to the next pet.                                    |
| `/pet perch`   | Toggle the ever-present perch widget on/off.             |
| `/pet soul`    | Toggle channeling the pet's soul into the agent's tone.  |
| `/pet bio`     | Print the active pet's soul.                             |
| `/pet say`     | Make the pet say something now.                           |
| `/pet off`     | Restore the built-in header and hide the pet.            |

Your choices persist across every session (stored in `~/.pi/agent/pets.json`).

## Ever-present mode

`/pet perch` docks the pet below the editor where it stays put and pipes up:

```
/)_)  nyx: "compiles after midnight"
```

It rotates to a fresh quip every 60s while idle, and says something when a turn finishes. The idle timer is fire-and-forget: it only swaps the widget line, never nudges the model or triggers a turn.

## Soul

`/pet soul` folds the active pet's character sheet into the system prompt as a **tone layer only** — the framing tells the model to let the persona color phrasing, never its reasoning, correctness, or engineering judgment. Turn it off and the agent is its plain self again. The `✦` on the footer badge shows when a soul is active.

## Adding your own pet

A pet is one markdown file: YAML frontmatter for the mechanics, the body for the soul. Drop `pets/mypet.md`:

```markdown
---
name: mypet
display: M Y P E T
subtitle: does the thing
emoji: "🐾"
art:
  - " (o o)"
  - " /|_|\\"
  - "  ^ ^"
  - '  " "'
taglines:
  - hello
  - still here
  - beep
palette:
  bg: "#141018"
  accent: "#88ccff"
  accent2: "#ffd479"
  heading: "#ff7ad0"
  ok: "#8ce29a"
  warn: "#ffd479"
  err: "#ff6a8a"
  code: "#8ce2d0"
  muted: "#9a94b0"
  dim: "#5a5470"
  border: "#3a3450"
  text: "#eee8ff"
  comment: "#6a6488"
---

Mypet is who it is. A sentence or two of essence.

## Temperament
...

## Voice
...

## Lore
...
```

Then build:

```
npm run gen
```

That parses every `pets/*.md` and writes `generated/pets.json` (data + soul, read at runtime) and `themes/mypet.json` (the full 51-token pi theme, derived from your compact `palette`; light vs dark is detected from `bg`). Don't hand-edit `generated/` or `themes/` — edit the pet's `.md` and regenerate.

`art` is 3-5 short lines, mascot on the left. The middle line doubles as the pet's face on the perch, so make it a good one. The body after the frontmatter is the soul that `/pet soul` channels and `/pet bio` prints — write as much character as you like.

## Layout

```
pets/
├── pets/*.md               # the characters: frontmatter + soul (you edit these)
├── generated/pets.json     # built runtime bundle (data + soul) — do not hand-edit
├── themes/*.json           # built pi themes from each palette — do not hand-edit
├── extensions/
│   ├── pets.ts             # pi glue: header, badge, perch, soul, /pet, persistence
│   └── pets-core.mjs       # pure logic: loading, rendering, theme expansion
├── scripts/gen.mjs         # pets/*.md -> generated/pets.json + themes/*.json
└── tests/pets-core.test.mjs
```

Build pipeline: `pets/<name>.md` → `npm run gen` → `generated/pets.json` + `themes/<name>.json`.

## Notes

- The header and perch render only in interactive terminal mode; they're no-ops in `-p`/print and JSON modes.
- `/pet <name>` switches the theme too. Want the character without recoloring? Reselect your theme via `/settings` after switching.
- Runtime has zero dependencies (reads generated JSON). The generator uses `yaml` (a devDependency) to parse frontmatter; it isn't needed to run the extension.
- `npm test` runs the unit tests (`node --test`): discovery, markdown parsing, rendering, and that every generated theme has all required tokens.
