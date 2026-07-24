/**
 * active-model - tell the orchestrator which model it is running.
 *
 * Injects a one-line <active-model> callout into the system prompt each turn,
 * read live from ctx.model, so the model knows its own identity (and updates on
 * a mid-session /model switch). Lets orchestration adapt: fan out when strong,
 * do the work directly when already cheap or local.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { activeModelBlock } from "./active-model-core.mjs";

export default function activeModel(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event: any, ctx: any) => {
    const block = activeModelBlock(ctx?.model);
    if (!block) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
  });
}
