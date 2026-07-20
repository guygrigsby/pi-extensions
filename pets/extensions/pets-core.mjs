// pets-core — pure helpers for the pets extension.
// No pi imports, so this is unit-testable and reusable by the theme generator.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// --- pet loading ---------------------------------------------------------

// Load the generated bundle (generated/pets.json) the generator built from the
// pets/*.md source files. Runtime is dependency-free: it reads JSON, never YAML.
// Returns a name->pet map (each pet includes its `soul` prose).
export function loadPets(bundleFile) {
  const list = JSON.parse(fs.readFileSync(bundleFile, "utf8"));
  const pets = {};
  for (const pet of list) {
    validatePet(pet, pet.name ?? bundleFile);
    pets[pet.name] = pet;
  }
  return pets;
}

export function validatePet(pet, file = "<pet>") {
  for (const key of ["name", "display", "subtitle", "art", "taglines", "palette"]) {
    if (pet[key] == null) throw new Error(`${file}: pet missing "${key}"`);
  }
  if (!Array.isArray(pet.art) || pet.art.length === 0) {
    throw new Error(`${file}: pet "art" must be a non-empty array of lines`);
  }
  if (!Array.isArray(pet.taglines) || pet.taglines.length === 0) {
    throw new Error(`${file}: pet "taglines" must be a non-empty array`);
  }
  return pet;
}

// --- banner rendering ----------------------------------------------------

function padRaw(s, n) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

// Build the header lines. `fg(token, text)` colors text with a theme token.
// Mascot art (left column) in accent; wordmark/subtitle/tagline on the right.
export function renderBanner(pet, fg, tagline) {
  const width = Math.max(9, ...pet.art.map((l) => l.length)) + 2;
  const right = [
    fg("borderAccent", pet.display),
    fg("muted", pet.subtitle),
    fg("dim", `"${tagline}"`),
  ];
  const lines = [""];
  pet.art.forEach((artLine, i) => {
    const left = fg("accent", padRaw(artLine, width));
    lines.push("  " + left + (right[i] ? "  " + right[i] : ""));
  });
  lines.push("");
  return lines;
}

export function pickTagline(pet, rand = Math.random) {
  return pet.taglines[Math.floor(rand() * pet.taglines.length)];
}

// The ever-present perch: one compact line, mascot face + speech bubble.
// Uses the pet's middle art line (its "face") to stay to a single row.
export function renderPerch(pet, fg, quip) {
  const face = pet.art[Math.floor(pet.art.length / 2)].trim();
  return [
    fg("accent", face) +
      "  " +
      fg("borderAccent", pet.name) +
      fg("muted", ": ") +
      fg("dim", quip),
  ];
}

// --- soul: mid-session voice switch --------------------------------------

// The channeled soul rides in the system prompt, but a mid-session pet switch
// loses to conversation-history inertia: the model imitates its own earlier
// (previous-pet) replies over a "tone only" system-prompt line. This is the
// counterweight — a one-shot, hidden (model-only) message injected via
// before_agent_start. It lands in the message history at the same level as
// those prior replies, so it actually outranks them.
export function voiceSwitchNudge(pet) {
  return {
    customType: "pets-voice-switch",
    display: false, // model reads it; user's transcript stays clean
    content:
      `[Companion switched] Your companion is now ${pet.display} (${pet.subtitle}). ` +
      `Abandon the previous companion's voice completely — disregard how earlier replies in ` +
      `this conversation sounded. Speak entirely as ${pet.display} from here on. Tone only: ` +
      `never let it override correctness or engineering judgment.`,
  };
}

// --- persistence ---------------------------------------------------------
// Durable global default: which pet is active, across every session.

export function stateFile() {
  return path.join(os.homedir(), ".pi", "agent", "pets.json");
}

const DEFAULT_STATE = { pet: null, perch: false, soul: false };

export function readState() {
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(stateFile(), "utf8")) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

// Merge a patch into the persisted state. Returns the new state (or the
// unchanged state if the write failed — callers can still use it in-memory).
export function writeState(patch) {
  const next = { ...readState(), ...patch };
  const f = stateFile();
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(next, null, 2) + "\n");
  } catch {
    /* read-only home: keep going with in-memory state */
  }
  return next;
}

// --- theme expansion -----------------------------------------------------
// Expand a pet's compact palette into a full pi theme (all 51 tokens).

function hexToRgb(h) {
  const n = h.replace("#", "");
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
function luminance(h) {
  const [r, g, b] = hexToRgb(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Given a compact palette, derive background variants and return full vars.
export function expandTheme(pet) {
  const p = pet.palette;
  const light = luminance(p.bg) > 0.5;
  const toward = light ? "#ffffff" : "#000000";
  const away = light ? "#000000" : "#ffffff";
  const shade = (amt) => mix(p.bg, toward, light ? amt * 0.35 : amt); // gentler on light bg

  const vars = {
    bg: p.bg,
    bgDark: shade(0.28),
    bgPopup: shade(0.42),
    bgHighlight: mix(p.bg, p.accent, 0.16),
    bgCustom: mix(p.bg, p.heading, 0.1),
    bgSuccess: mix(p.bg, p.ok, 0.22),
    bgError: mix(p.bg, p.err, 0.22),
    accent: p.accent,
    accent2: p.accent2,
    heading: p.heading,
    ok: p.ok,
    warn: p.warn,
    err: p.err,
    errStrong: mix(p.err, away, 0.15),
    code: p.code,
    text: p.text,
    muted: p.muted,
    dim: p.dim,
    comment: p.comment ?? p.muted,
    border: p.border,
    borderMuted: mix(p.border, p.bg, 0.5),
    number: p.warn,
    type: p.accent,
  };

  const colors = {
    accent: "accent",
    border: "border",
    borderAccent: "accent2",
    borderMuted: "borderMuted",
    success: "ok",
    error: "err",
    warning: "warn",
    muted: "muted",
    dim: "dim",
    text: "",
    thinkingText: "muted",
    selectedBg: "bgHighlight",
    userMessageBg: "",
    userMessageText: "accent2",
    customMessageBg: "bgCustom",
    customMessageText: "",
    customMessageLabel: "heading",
    toolPendingBg: "bgPopup",
    toolSuccessBg: "bgSuccess",
    toolErrorBg: "bgError",
    toolTitle: "accent2",
    toolOutput: "muted",
    mdHeading: "heading",
    mdLink: "accent2",
    mdLinkUrl: "muted",
    mdCode: "code",
    mdCodeBlock: "text",
    mdCodeBlockBorder: "borderMuted",
    mdQuote: "muted",
    mdQuoteBorder: "borderMuted",
    mdHr: "accent2",
    mdListBullet: "accent2",
    toolDiffAdded: "ok",
    toolDiffRemoved: "err",
    toolDiffContext: "dim",
    syntaxComment: "comment",
    syntaxKeyword: "heading",
    syntaxFunction: "accent2",
    syntaxVariable: "text",
    syntaxString: "ok",
    syntaxNumber: "number",
    syntaxType: "accent2",
    syntaxOperator: "accent2",
    syntaxPunctuation: "muted",
    thinkingOff: "dim",
    thinkingMinimal: "border",
    thinkingLow: "accent2",
    thinkingMedium: "accent",
    thinkingHigh: "heading",
    thinkingXhigh: "accent2",
    thinkingMax: "code",
    bashMode: "warn",
  };

  return {
    $schema:
      "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
    name: pet.theme ?? pet.name,
    vars,
    colors,
    export: { pageBg: vars.bgDark, cardBg: vars.bgCustom, infoBg: vars.bgHighlight },
  };
}
