// promptdump/extensions/index.ts
import { Text } from "@earendil-works/pi-tui";

// promptdump/extensions/promptdump-core.mjs
function normalize(payload) {
  if (payload == null || typeof payload !== "object") return [];
  const out = [];
  if (typeof payload.system === "string" && payload.system) {
    out.push({ role: "system", text: payload.system });
  }
  const msgs = Array.isArray(payload.messages) ? payload.messages : [];
  for (const m of msgs) {
    const role = m && m.role ? String(m.role) : "?";
    const c = m ? m.content : void 0;
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x && typeof x.text === "string" ? x.text : `[${x && x.type || "?"}]`).join("\n") : c == null ? "" : JSON.stringify(c);
    out.push({ role, text });
  }
  return out;
}
function formatFull(payload) {
  const parts = normalize(payload);
  if (parts.length === 0) return JSON.stringify(payload ?? null, null, 2);
  return parts.map((p) => `### ${p.role}
${p.text}`).join("\n\n");
}
function formatSummary(payload) {
  const parts = normalize(payload);
  if (parts.length === 0) {
    return "context: empty or unrecognized payload. /dump-context full for raw JSON.";
  }
  const total = parts.reduce((n, p) => n + p.text.length, 0);
  const lines = parts.map((p) => {
    const preview = p.text.replace(/\s+/g, " ").trim().slice(0, 80);
    const ellipsis = p.text.length > 80 ? "..." : "";
    return `  ${p.role.padEnd(9)} ${String(p.text.length).padStart(7)} chars  ${preview}${ellipsis}`;
  });
  return `context: ${parts.length} messages, ${total} chars (~${Math.round(total / 4)} tokens)
${lines.join("\n")}
/dump-context full to expand.`;
}

// promptdump/extensions/index.ts
var lastPayload = null;
function promptDump(pi) {
  pi.on("before_provider_request", async (event) => {
    lastPayload = event?.payload ?? null;
  });
  pi.registerEntryRenderer("dump-context", (entry, _options, _theme) => {
    return new Text(String(entry?.data?.text ?? ""), 1, 0);
  });
  pi.registerCommand("dump-context", {
    description: "Show the context sent to the model on the last request (folded; `full` to expand).",
    getArgumentCompletions: (prefix) => "full".startsWith(prefix) ? [{ value: "full", label: "full" }] : null,
    handler: async (args, ctx) => {
      if (lastPayload == null) {
        ctx.ui?.notify?.("No request captured yet. Send a message first.", "info");
        return;
      }
      const full = String(args || "").trim().toLowerCase() === "full";
      pi.appendEntry("dump-context", { text: full ? formatFull(lastPayload) : formatSummary(lastPayload) });
    }
  });
}
export {
  promptDump as default
};
