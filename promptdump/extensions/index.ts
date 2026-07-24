/**
 * promptdump - see the exact context sent to the model.
 *
 * Captures the provider payload at before_provider_request (the fully assembled
 * system prompt plus messages, after every per-turn injection like
 * claude-memory and hermes), in memory. The /dump-context command shows it:
 *   /dump-context        folded summary (one line per message, sizes, preview)
 *   /dump-context full   the whole thing expanded
 *
 * Output is a display-only transcript entry (never sent to the model).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatSummary, formatFull } from "./promptdump-core.mjs";

let lastPayload: unknown = null;

export default function promptDump(pi: ExtensionAPI): void {
  pi.on("before_provider_request", async (event: any) => {
    lastPayload = event?.payload ?? null;
  });

  // Display-only renderer for our custom entry: plain text in the transcript.
  pi.registerEntryRenderer("dump-context", (entry: any, _options: any, _theme: any) => {
    return new Text(String(entry?.data?.text ?? ""), 1, 0);
  });

  pi.registerCommand("dump-context", {
    description: "Show the context sent to the model on the last request (folded; `full` to expand).",
    getArgumentCompletions: (prefix: string) =>
      "full".startsWith(prefix) ? [{ value: "full", label: "full" }] : null,
    handler: async (args: string, ctx: any) => {
      if (lastPayload == null) {
        ctx.ui?.notify?.("No request captured yet. Send a message first.", "info");
        return;
      }
      const full = String(args || "").trim().toLowerCase() === "full";
      pi.appendEntry("dump-context", { text: full ? formatFull(lastPayload) : formatSummary(lastPayload) });
    },
  });
}
