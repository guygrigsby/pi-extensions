// pets/extensions/pets.ts
import { fileURLToPath } from "node:url";
import path2 from "node:path";

// pets/extensions/pets-core.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function loadPets(bundleFile) {
  const list = JSON.parse(fs.readFileSync(bundleFile, "utf8"));
  const pets = {};
  for (const pet of list) {
    validatePet(pet, pet.name ?? bundleFile);
    pets[pet.name] = pet;
  }
  return pets;
}
function validatePet(pet, file = "<pet>") {
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
function padRaw(s, n) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function renderBanner(pet, fg, tagline) {
  const width = Math.max(9, ...pet.art.map((l) => l.length)) + 2;
  const right = [
    fg("borderAccent", pet.display),
    fg("muted", pet.subtitle),
    fg("dim", `"${tagline}"`)
  ];
  const lines = [""];
  pet.art.forEach((artLine, i) => {
    const left = fg("accent", padRaw(artLine, width));
    lines.push("  " + left + (right[i] ? "  " + right[i] : ""));
  });
  lines.push("");
  return lines;
}
function pickTagline(pet, rand = Math.random) {
  return pet.taglines[Math.floor(rand() * pet.taglines.length)];
}
function renderPerch(pet, fg, quip) {
  const face = pet.art[Math.floor(pet.art.length / 2)].trim();
  return [
    fg("accent", face) + "  " + fg("borderAccent", pet.name) + fg("muted", ": ") + fg("dim", quip)
  ];
}
function voiceSwitchNudge(pet) {
  return {
    customType: "pets-voice-switch",
    display: false,
    // model reads it; user's transcript stays clean
    content: `[Companion switched] Your companion is now ${pet.display} (${pet.subtitle}). Abandon the previous companion's voice completely \u2014 disregard how earlier replies in this conversation sounded. Speak entirely as ${pet.display} from here on. Tone only: never let it override correctness or engineering judgment.`
  };
}
function stateFile() {
  return path.join(os.homedir(), ".pi", "agent", "pets.json");
}
var DEFAULT_STATE = { pet: null, perch: false, soul: false };
function readState() {
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(stateFile(), "utf8")) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}
function writeState(patch) {
  const next = { ...readState(), ...patch };
  const f = stateFile();
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(next, null, 2) + "\n");
  } catch {
  }
  return next;
}

// pets/extensions/pets.ts
var IDLE_CHATTER_MS = 6e4;
var HERE = path2.dirname(fileURLToPath(import.meta.url));
var BUNDLE = path2.join(HERE, "..", "generated", "pets.json");
function pets_default(pi) {
  const pets = loadPets(BUNDLE);
  const names = Object.keys(pets);
  if (names.length === 0) return;
  let state = readState();
  let activeName = state.pet && names.includes(state.pet) ? state.pet : names[0];
  let quip = pickTagline(pets[activeName]);
  let timer;
  let lastCtx = null;
  let voiceSwitchPending = false;
  const pet = () => pets[activeName];
  const paintHeader = (ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setHeader((_tui, theme) => ({
      render: () => renderBanner(pet(), (t, s) => theme.fg(t, s), quip),
      invalidate() {
      }
    }));
  };
  const paintBadge = (ctx) => {
    const theme = ctx.ui?.theme;
    const soul = state.soul ? "\u2726" : "";
    const label = theme ? theme.fg("accent", `${pet().emoji ?? "\u{1F43E}"} `) + theme.fg("borderAccent", activeName) + theme.fg("dim", soul) : `${pet().emoji ?? "\u{1F43E}"} ${activeName}${soul}`;
    ctx.ui?.setStatus?.("pets", label);
  };
  const paintPerch = (ctx) => {
    if (ctx.mode !== "tui") return;
    const theme = ctx.ui?.theme;
    if (!state.perch || !theme) {
      ctx.ui?.setWidget?.("pets", []);
      return;
    }
    const lines = renderPerch(pet(), (t, s) => theme.fg(t, s), quip);
    ctx.ui.setWidget("pets", lines, { placement: "belowEditor" });
  };
  const repaint = (ctx) => {
    lastCtx = ctx;
    paintHeader(ctx);
    paintBadge(ctx);
    paintPerch(ctx);
  };
  const say = (ctx, next) => {
    quip = next ?? pickTagline(pet());
    paintHeader(ctx);
    paintPerch(ctx);
  };
  const startTimer = (ctx) => {
    stopTimer();
    if (!state.perch || ctx.mode !== "tui") return;
    timer = setInterval(() => {
      if (lastCtx) say(lastCtx);
    }, IDLE_CHATTER_MS);
    timer?.unref?.();
  };
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = void 0;
  };
  const applyTheme = (ctx) => {
    try {
      ctx.ui?.setTheme?.(pet().theme ?? activeName);
    } catch {
    }
  };
  pi.on("session_start", async (_e, ctx) => {
    state = readState();
    if (state.pet && names.includes(state.pet)) activeName = state.pet;
    quip = pickTagline(pet());
    repaint(ctx);
    startTimer(ctx);
  });
  pi.on("before_agent_start", async (event) => {
    if (!state.soul || !pet().soul) {
      voiceSwitchPending = false;
      return;
    }
    const persona = `

## Companion: ${pet().display} (${pet().subtitle})
A ${activeName} is keeping you company. Let this color your TONE and phrasing only \u2014 not your reasoning, correctness, or engineering judgment. Stay accurate first.

` + pet().soul;
    const result = {
      systemPrompt: event.systemPrompt + persona
    };
    if (voiceSwitchPending) {
      voiceSwitchPending = false;
      result.message = voiceSwitchNudge(pet());
    }
    return result;
  });
  pi.on("agent_end", async (_e, ctx) => {
    if (state.perch) say(ctx);
  });
  pi.on("session_shutdown", async (_e, ctx) => {
    stopTimer();
    ctx.ui?.setStatus?.("pets", void 0);
    ctx.ui?.setWidget?.("pets", []);
  });
  pi.registerCommand("pet", {
    description: "Switch/show your coding pet. /pet <name> | next | perch | soul | bio | say | off",
    getArgumentCompletions: (prefix) => {
      const items = [...names, "next", "perch", "soul", "bio", "say", "off"].filter((v) => v.startsWith(prefix)).map((v) => ({ value: v, label: v }));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      const arg = String(args || "").trim().toLowerCase();
      lastCtx = ctx;
      if (arg === "off") {
        stopTimer();
        ctx.ui.setHeader(void 0);
        ctx.ui.setStatus("pets", void 0);
        ctx.ui.setWidget("pets", []);
        ctx.ui.notify("Pets hidden. /pet <name> to bring one back.", "info");
        return;
      }
      if (arg === "perch") {
        state = writeState({ perch: !state.perch });
        paintPerch(ctx);
        paintBadge(ctx);
        startTimer(ctx);
        ctx.ui.notify(state.perch ? `${activeName} is perched.` : `${activeName} flew off.`, "info");
        return;
      }
      if (arg === "soul") {
        state = writeState({ soul: !state.soul });
        if (state.soul) voiceSwitchPending = true;
        paintBadge(ctx);
        ctx.ui.notify(
          state.soul ? `Channeling ${activeName}'s soul (tone only). /pet soul to stop.` : `Stopped channeling ${activeName}.`,
          "info"
        );
        return;
      }
      if (arg === "bio") {
        ctx.ui.notify(`${pet().display} \u2014 ${pet().subtitle}

${pet().soul ?? "(no soul written)"}`, "info");
        return;
      }
      if (arg === "say") {
        say(ctx);
        ctx.ui.notify(`${activeName}: "${quip}"`, "info");
        return;
      }
      if (arg === "") {
        const soul = state.soul ? " \xB7 soul on" : "";
        ctx.ui.notify(
          `Active: ${activeName} \u2014 "${quip}"${soul}. Pets: ${names.join(", ")}. /pet <name> to switch.`,
          "info"
        );
        return;
      }
      let target = arg;
      if (arg === "next" || arg === "random") {
        const i = names.indexOf(activeName);
        target = arg === "next" ? names[(i + 1) % names.length] : names[Math.floor(Math.random() * names.length)];
      }
      if (!names.includes(target)) {
        ctx.ui.notify(`No pet "${target}". Try: ${names.join(", ")}`, "error");
        return;
      }
      activeName = target;
      state = writeState({ pet: activeName });
      if (state.soul) voiceSwitchPending = true;
      quip = pickTagline(pet());
      applyTheme(ctx);
      repaint(ctx);
      startTimer(ctx);
      ctx.ui.notify(`${pet().emoji ?? "\u{1F43E}"} ${activeName}: "${quip}"`, "info");
    }
  });
}
export {
  pets_default as default
};
