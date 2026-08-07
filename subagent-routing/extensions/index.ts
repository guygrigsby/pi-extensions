/**
 * subagent-routing - inject the subagent model-routing policy into the system
 * prompt each turn: the orchestrator plans/judges on its own (live) model and
 * fans implementation out to configured subagent models, then reviews before
 * accepting.
 *
 * The fan-out menu is built each turn from the model registry (everything
 * configured and authenticated), ranked by the mode in
 * <agentDir>/subagent-routing.json: "cost" | "balance" | "performance".
 * Switch with /subagent-routing <mode>. The orchestrator/judge model is never
 * named: spawn with no `model` override and the subagent inherits the live one.
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

function loadMode(): string {
  try {
    const mode = JSON.parse(readFileSync(CONFIG_PATH, "utf8"))?.mode;
    if (MODES.includes(mode)) return mode;
  } catch {
    // missing or malformed config falls through to the default
  }
  return "balance";
}

export default function subagentRouting(pi: ExtensionAPI): void {
  let mode = loadMode();

  pi.registerCommand("subagent-routing", {
    description: `Subagent fan-out mode (${MODES.join(" | ")})`,
    handler: async (args, ctx) => {
      const next = args?.trim();
      if (!next) {
        ctx.ui.notify(`subagent-routing mode: ${mode}`, "info");
        return;
      }
      if (!MODES.includes(next)) {
        ctx.ui.notify(`unknown mode "${next}" — use ${MODES.join(", ")}`, "error");
        return;
      }
      mode = next;
      mkdirSync(dirname(CONFIG_PATH), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify({ mode }, null, 2) + "\n");
      ctx.ui.notify(`subagent-routing mode: ${mode} (applies next turn)`, "info");
    },
  });

  pi.on("before_agent_start", async (event: any, ctx: any) => {
    const reg = ctx.modelRegistry;
    const models = reg.getAvailable?.() ?? reg.getAll();
    const selfId = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
    const policy = buildPolicy(models, { mode, selfId });
    return { systemPrompt: `${event.systemPrompt}\n\n${policy}` };
  });
}
