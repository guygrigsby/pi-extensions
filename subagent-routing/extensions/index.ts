/**
 * subagent-routing - inject the subagent model-routing policy into the system
 * prompt each turn: the orchestrator plans/judges on its own (live) model and
 * fans implementation out to cheaper subagents, then reviews before accepting.
 *
 * The policy names no orchestrator/judge model (those inherit the live model);
 * only the cheap fan-out menu is explicit, edited in subagent-routing-core.mjs.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SUBAGENT_ROUTING_POLICY } from "./subagent-routing-core.mjs";

export default function subagentRouting(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event: any) => {
    return { systemPrompt: `${event.systemPrompt}\n\n${SUBAGENT_ROUTING_POLICY}` };
  });
}
