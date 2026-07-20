// promptdump-core - pure formatting of a captured provider request payload.
// No pi imports, so this is unit-testable in plain node.

// Normalize a payload into [{role, text}] defensively across provider shapes:
// a top-level `system` string becomes a system entry, and message `content`
// may be a string or an array of parts.
export function normalize(payload) {
  if (payload == null || typeof payload !== "object") return [];
  const out = [];
  if (typeof payload.system === "string" && payload.system) {
    out.push({ role: "system", text: payload.system });
  }
  const msgs = Array.isArray(payload.messages) ? payload.messages : [];
  for (const m of msgs) {
    const role = m && m.role ? String(m.role) : "?";
    const c = m ? m.content : undefined;
    const text =
      typeof c === "string"
        ? c
        : Array.isArray(c)
          ? c.map((x) => (x && typeof x.text === "string" ? x.text : `[${(x && x.type) || "?"}]`)).join("\n")
          : c == null
            ? ""
            : JSON.stringify(c);
    out.push({ role, text });
  }
  return out;
}

// Full readable dump: every role and its content, in order.
export function formatFull(payload) {
  const parts = normalize(payload);
  if (parts.length === 0) return JSON.stringify(payload ?? null, null, 2);
  return parts.map((p) => `### ${p.role}\n${p.text}`).join("\n\n");
}

// Folded summary: one line per message with size and a preview, plus totals
// and the hint to expand.
export function formatSummary(payload) {
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
  return (
    `context: ${parts.length} messages, ${total} chars (~${Math.round(total / 4)} tokens)\n` +
    `${lines.join("\n")}\n` +
    `/dump-context full to expand.`
  );
}
