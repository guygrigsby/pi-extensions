#!/usr/bin/env node
// Build the runtime bundle and themes from the pet source files.
//
//   pets/<name>.md  --->  generated/pets.json   (data + soul, read at runtime)
//                    \->  themes/<name>.json     (full pi theme, from palette)
//
// Run after adding or editing a pet: `npm run gen`.
// Never hand-edit generated/ or themes/ — edit the pet's .md and regenerate.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { validatePet, expandTheme } from "../extensions/pets-core.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const petsDir = path.join(root, "pets");
const themesDir = path.join(root, "themes");
const genDir = path.join(root, "generated");

// Split a pet .md into YAML frontmatter and the soul body. Pure; exported for tests.
export function parsePetMarkdown(text, file = "<pet>") {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing YAML frontmatter (--- ... ---)`);
  const pet = YAML.parse(m[1]);
  pet.soul = m[2].trim();
  validatePet(pet, file);
  return pet;
}

export function loadPetSources(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parsePetMarkdown(fs.readFileSync(path.join(dir, f), "utf8"), f));
}

function main() {
  const pets = loadPetSources(petsDir);

  fs.mkdirSync(genDir, { recursive: true });
  fs.writeFileSync(path.join(genDir, "pets.json"), JSON.stringify(pets, null, 2) + "\n");

  fs.mkdirSync(themesDir, { recursive: true });
  for (const pet of pets) {
    const theme = expandTheme(pet);
    fs.writeFileSync(path.join(themesDir, `${theme.name}.json`), JSON.stringify(theme, null, 2) + "\n");
  }

  console.log(
    `built ${pets.length} pets -> generated/pets.json + ${pets.length} themes:`,
    pets.map((p) => p.name).join(", "),
  );
}

// Only run when invoked directly, so tests can import the parser.
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main();
}
