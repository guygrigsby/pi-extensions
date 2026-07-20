/**
 * pets — a switchable menagerie of coding-agent companions for pi.
 *
 * Each pet is a markdown file in ../pets/*.md (frontmatter: art, taglines,
 * palette; body: the pet's soul). `npm run gen` builds ../generated/pets.json
 * and ../themes/*.json from those. This extension reads the generated bundle,
 * paints a header + footer badge, optionally perches the pet ever-present in
 * the TUI where it says things, optionally channels the pet's soul into the
 * agent's tone, and switches everything via /pet.
 *
 * Commands:
 *   /pet               show the active pet and list the rest
 *   /pet <name>        switch to a pet (also switches its theme)
 *   /pet next          cycle to the next pet
 *   /pet perch         toggle the ever-present perch widget on/off
 *   /pet soul          toggle channeling the pet's soul into the agent's tone
 *   /pet bio           print the active pet's soul
 *   /pet say           make the pet say something now
 *   /pet off           restore the built-in header and hide the pet
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import {
  loadPets,
  renderBanner,
  renderPerch,
  pickTagline,
  readState,
  writeState,
  voiceSwitchNudge,
} from "./pets-core.mjs";

// How often the perched pet rotates to a fresh idle quip (ms). Idle-only: the
// timer just swaps the widget's line; it never nags the LLM or triggers a turn.
// ponytail: fixed cadence, no per-pet knob until someone wants one.
const IDLE_CHATTER_MS = 60_000;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.join(HERE, "..", "generated", "pets.json");

export default function (pi: ExtensionAPI) {
  const pets = loadPets(BUNDLE);
  const names = Object.keys(pets);
  if (names.length === 0) return;

  let state = readState();
  let activeName = state.pet && names.includes(state.pet) ? state.pet : names[0];
  let quip = pickTagline(pets[activeName]);
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastCtx: any = null;
  // One-shot: set when the channeled voice should change mid-session (pet
  // switch, or soul turned on). Consumed by the next before_agent_start to
  // inject a nudge that beats conversation-history inertia.
  let voiceSwitchPending = false;

  const pet = () => pets[activeName];

  const paintHeader = (ctx: any) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setHeader((_tui: unknown, theme: Theme) => ({
      render: () => renderBanner(pet(), (t: string, s: string) => theme.fg(t as any, s), quip),
      invalidate() {},
    }));
  };

  const paintBadge = (ctx: any) => {
    const theme = ctx.ui?.theme;
    const soul = state.soul ? "✦" : "";
    const label = theme
      ? theme.fg("accent", `${pet().emoji ?? "🐾"} `) + theme.fg("borderAccent", activeName) + theme.fg("dim", soul)
      : `${pet().emoji ?? "🐾"} ${activeName}${soul}`;
    ctx.ui?.setStatus?.("pets", label);
  };

  const paintPerch = (ctx: any) => {
    if (ctx.mode !== "tui") return;
    const theme = ctx.ui?.theme;
    if (!state.perch || !theme) {
      ctx.ui?.setWidget?.("pets", []);
      return;
    }
    const lines = renderPerch(pet(), (t: string, s: string) => theme.fg(t as any, s), quip);
    ctx.ui.setWidget("pets", lines, { placement: "belowEditor" });
  };

  const repaint = (ctx: any) => {
    lastCtx = ctx;
    paintHeader(ctx);
    paintBadge(ctx);
    paintPerch(ctx);
  };

  const say = (ctx: any, next?: string) => {
    quip = next ?? pickTagline(pet());
    paintHeader(ctx);
    paintPerch(ctx);
  };

  const startTimer = (ctx: any) => {
    stopTimer();
    if (!state.perch || ctx.mode !== "tui") return;
    timer = setInterval(() => {
      if (lastCtx) say(lastCtx); // idle rotation, event-free
    }, IDLE_CHATTER_MS);
    (timer as any)?.unref?.(); // don't keep the process alive just for chatter
  };
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  const applyTheme = (ctx: any) => {
    try {
      ctx.ui?.setTheme?.(pet().theme ?? activeName);
    } catch {
      /* theme not installed — character still switches */
    }
  };

  pi.on("session_start", async (_e, ctx) => {
    state = readState();
    if (state.pet && names.includes(state.pet)) activeName = state.pet;
    quip = pickTagline(pet());
    repaint(ctx);
    startTimer(ctx);
  });

  // Soul: when channeling is on, fold the pet's persona into the system prompt
  // as a TONE layer only — never overriding correctness or engineering judgment.
  pi.on("before_agent_start", async (event: any) => {
    if (!state.soul || !pet().soul) {
      voiceSwitchPending = false; // nothing to channel; drop any stale nudge
      return;
    }
    const persona =
      `\n\n## Companion: ${pet().display} (${pet().subtitle})\n` +
      `A ${activeName} is keeping you company. Let this color your TONE and phrasing only — ` +
      `not your reasoning, correctness, or engineering judgment. Stay accurate first.\n\n` +
      pet().soul;
    const result: { systemPrompt: string; message?: ReturnType<typeof voiceSwitchNudge> } = {
      systemPrompt: event.systemPrompt + persona,
    };
    if (voiceSwitchPending) {
      voiceSwitchPending = false; // one-shot
      result.message = voiceSwitchNudge(pet());
    }
    return result;
  });

  // Event-driven chatter: pipe up when a turn finishes.
  pi.on("agent_end", async (_e, ctx) => {
    if (state.perch) say(ctx);
  });

  pi.on("session_shutdown", async (_e, ctx) => {
    stopTimer();
    ctx.ui?.setStatus?.("pets", undefined);
    ctx.ui?.setWidget?.("pets", []);
  });

  pi.registerCommand("pet", {
    description: "Switch/show your coding pet. /pet <name> | next | perch | soul | bio | say | off",
    getArgumentCompletions: (prefix: string) => {
      const items = [...names, "next", "perch", "soul", "bio", "say", "off"]
        .filter((v) => v.startsWith(prefix))
        .map((v) => ({ value: v, label: v }));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      const arg = String(args || "").trim().toLowerCase();
      lastCtx = ctx;

      if (arg === "off") {
        stopTimer();
        ctx.ui.setHeader(undefined);
        ctx.ui.setStatus("pets", undefined);
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
        if (state.soul) voiceSwitchPending = true; // adopt the voice on the next turn
        paintBadge(ctx);
        ctx.ui.notify(
          state.soul
            ? `Channeling ${activeName}'s soul (tone only). /pet soul to stop.`
            : `Stopped channeling ${activeName}.`,
          "info",
        );
        return;
      }
      if (arg === "bio") {
        ctx.ui.notify(`${pet().display} — ${pet().subtitle}\n\n${pet().soul ?? "(no soul written)"}`, "info");
        return;
      }
      if (arg === "say") {
        say(ctx);
        ctx.ui.notify(`${activeName}: "${quip}"`, "info");
        return;
      }
      if (arg === "") {
        const soul = state.soul ? " · soul on" : "";
        ctx.ui.notify(
          `Active: ${activeName} — "${quip}"${soul}. Pets: ${names.join(", ")}. /pet <name> to switch.`,
          "info",
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
      if (state.soul) voiceSwitchPending = true; // channel the new voice on the next turn
      quip = pickTagline(pet());
      applyTheme(ctx);
      repaint(ctx);
      startTimer(ctx);
      ctx.ui.notify(`${pet().emoji ?? "🐾"} ${activeName}: "${quip}"`, "info");
    },
  });
}
