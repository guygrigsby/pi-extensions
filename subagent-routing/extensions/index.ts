/**
 * subagent-routing - inject the subagent model-routing policy into the system
 * prompt each turn: the orchestrator plans/judges on its own (live) model and
 * fans implementation out per a mode-shaped decision procedure, then reviews
 * before accepting.
 *
 * Every configured, non-local model is a candidate. The ladder is built each
 * turn from the model registry, tiered cheap/mid/frontier by price terciles
 * with optional per-model overrides from <agentDir>/subagent-routing.json:
 *
 *   { "mode": "cost", "tiers": { "kimi-coding/*": "frontier" } }
 *
 * Mode ("cost" | "performance") sets the decision rule, not the menu; switch
 * with /subagent-routing <mode>. Config is re-read every turn, so hand-edits
 * to the tiers map apply on the next turn. The orchestrator/judge model is
 * never named: spawn with no `model` override and the subagent inherits the
 * live one.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { MODES, buildPolicy } from "./subagent-routing-core.mjs";

const CONFIG_PATH = join(
  process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"),
  "subagent-routing.json",
);

interface Config {
  mode: string;
  tiers: Record<string, string>;
}

function loadConfig(): Config {
  let raw: any;
  try {
    raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    raw = {}; // missing or malformed config falls through to defaults
  }
  return {
    mode: MODES.includes(raw?.mode) ? raw.mode : "cost",
    tiers: typeof raw?.tiers === "object" && raw?.tiers !== null ? raw.tiers : {},
  };
}

export default function subagentRouting(pi: ExtensionAPI): void {
  pi.registerCommand("subagent-routing", {
    description: `Subagent fan-out mode (${MODES.join(" | ")})`,
    handler: async (args, ctx) => {
      const config = loadConfig();
      const next = args?.trim();
      if (!next) {
        ctx.ui.notify(`subagent-routing mode: ${config.mode}`, "info");
        return;
      }
      if (!MODES.includes(next)) {
        ctx.ui.notify(`unknown mode "${next}" — use ${MODES.join(", ")}`, "error");
        return;
      }
      config.mode = next;
      mkdirSync(dirname(CONFIG_PATH), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
      ctx.ui.notify(`subagent-routing mode: ${next} (applies next turn)`, "info");
    },
  });

  pi.on("before_agent_start", async (event: any, ctx: any) => {
    const { mode, tiers } = loadConfig();
    const reg = ctx.modelRegistry;
    const models = reg.getAvailable?.() ?? reg.getAll();
    const selfId = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
    const policy = buildPolicy(models, { mode, overrides: tiers, selfId });
    return { systemPrompt: `${event.systemPrompt}\n\n${policy}` };
  });
}
