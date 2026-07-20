import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPets,
  validatePet,
  renderBanner,
  renderPerch,
  pickTagline,
  expandTheme,
  voiceSwitchNudge,
} from "../extensions/pets-core.mjs";
import { parsePetMarkdown, loadPetSources } from "../scripts/gen.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = loadPets(path.join(ROOT, "generated", "pets.json"));
const sources = loadPetSources(path.join(ROOT, "pets"));
const plain = (_t, s) => s; // uncolored fg for assertions

test("generated bundle loads and every pet validates + has a soul", () => {
  assert.ok(Object.keys(bundle).length >= 1);
  for (const pet of Object.values(bundle)) {
    validatePet(pet);
    assert.ok(typeof pet.soul === "string" && pet.soul.length > 0, `${pet.name} has no soul`);
  }
});

test("markdown source parses into the same pets as the bundle", () => {
  assert.deepEqual(
    sources.map((p) => p.name).sort(),
    Object.keys(bundle).sort(),
  );
});

test("parsePetMarkdown splits frontmatter from soul body", () => {
  const md = [
    "---",
    "name: test",
    "display: T",
    "subtitle: a test",
    "art:",
    '  - " (o)"',
    "taglines:",
    "  - hi",
    "palette:",
    '  bg: "#101010"',
    '  accent: "#88ccff"',
    '  accent2: "#ffd479"',
    '  heading: "#ff7ad0"',
    '  ok: "#8ce29a"',
    '  warn: "#ffd479"',
    '  err: "#ff6a8a"',
    '  code: "#8ce2d0"',
    '  muted: "#9a94b0"',
    '  dim: "#5a5470"',
    '  border: "#3a3450"',
    '  text: "#eee8ff"',
    "---",
    "",
    "This is the soul.",
    "",
    "## Voice",
    "Terse.",
  ].join("\n");
  const pet = parsePetMarkdown(md);
  assert.equal(pet.name, "test");
  assert.match(pet.soul, /This is the soul/);
  assert.match(pet.soul, /## Voice/);
});

test("missing frontmatter throws", () => {
  assert.throws(() => parsePetMarkdown("no frontmatter here"), /frontmatter/);
});

test("banner puts wordmark/subtitle/tagline beside the art", () => {
  const pet = Object.values(bundle)[0];
  const blob = renderBanner(pet, plain, "hello").join("\n");
  assert.match(blob, new RegExp(pet.display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(blob, new RegExp(pet.subtitle));
  assert.match(blob, /"hello"/);
});

test("perch is a single line with name and quip", () => {
  const pet = Object.values(bundle)[0];
  const lines = renderPerch(pet, plain, "beep");
  assert.equal(lines.length, 1);
  assert.match(lines[0], new RegExp(`${pet.name}.*beep`));
});

test("pickTagline is deterministic under a seeded rand and stays in range", () => {
  const pet = Object.values(bundle)[0];
  assert.equal(pickTagline(pet, () => 0), pet.taglines[0]);
  assert.equal(pickTagline(pet, () => 0.999), pet.taglines[pet.taglines.length - 1]);
});

test("voiceSwitchNudge is a hidden model-only message that names the new pet and drops the old voice", () => {
  const pet = bundle.pixel ?? Object.values(bundle)[0];
  const nudge = voiceSwitchNudge(pet);
  assert.equal(nudge.display, false, "nudge must not clutter the transcript");
  assert.equal(typeof nudge.customType, "string");
  assert.equal(typeof nudge.content, "string");
  // Names the pet it is switching TO.
  assert.match(nudge.content, new RegExp(pet.display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  // Instructs the model to abandon the prior companion's voice.
  assert.match(nudge.content, /previous|prior|earlier/i);
  assert.match(nudge.content, /voice|persona|companion/i);
});

test("expandTheme yields all required color tokens with resolvable refs", () => {
  const REQUIRED = [
    "accent","border","borderAccent","borderMuted","success","error","warning","muted","dim","text","thinkingText",
    "selectedBg","userMessageBg","userMessageText","customMessageBg","customMessageText","customMessageLabel",
    "toolPendingBg","toolSuccessBg","toolErrorBg","toolTitle","toolOutput",
    "mdHeading","mdLink","mdLinkUrl","mdCode","mdCodeBlock","mdCodeBlockBorder","mdQuote","mdQuoteBorder","mdHr","mdListBullet",
    "toolDiffAdded","toolDiffRemoved","toolDiffContext",
    "syntaxComment","syntaxKeyword","syntaxFunction","syntaxVariable","syntaxString","syntaxNumber","syntaxType","syntaxOperator","syntaxPunctuation",
    "thinkingOff","thinkingMinimal","thinkingLow","thinkingMedium","thinkingHigh","thinkingXhigh","bashMode",
  ];
  for (const pet of Object.values(bundle)) {
    const theme = expandTheme(pet);
    for (const tok of REQUIRED) {
      assert.ok(tok in theme.colors, `${pet.name}: missing color ${tok}`);
      const ref = theme.colors[tok];
      assert.ok(ref === "" || ref in theme.vars || /^#[0-9a-f]{6}$/i.test(ref), `${pet.name}.${tok} -> ${ref} unresolved`);
    }
    for (const [k, v] of Object.entries(theme.vars)) {
      assert.match(v, /^#[0-9a-f]{6}$/i, `${pet.name}.vars.${k} = ${v} not hex`);
    }
  }
});
