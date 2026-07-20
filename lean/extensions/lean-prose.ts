/**
 * lean-prose — make the agent's prose short and dense.
 *
 * Appends a terseness layer to the system prompt each turn: lead with the
 * answer, cut preamble and filler, no scaffolding. Tone only — it never touches
 * correctness or thoroughness of the actual work.
 *
 *   /prose          toggle on/off (persists)
 *   /prose on|off   set directly
 *   PI_LEAN_PROSE   startup default: on (default) | off
 *
 * State persists to $PI_CODING_AGENT_DIR/lean-prose.json (or ~/.pi/agent/).
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const STATE = path.join(AGENT_DIR, "lean-prose.json");

const LAYER = `

## Output style: lean
Keep prose short and dense. Lead with the answer, no preamble or restating the
question. Cut filler and hedging; no "I'll help you", no summary of what you
just did unless asked. Prefer a sentence to a paragraph and a phrase to a
sentence. Use lists only when they carry more than prose would. This governs
tone and length ONLY — never trade away correctness, needed caveats, or the
completeness of the actual work.`;

function readEnabled(): boolean {
	try {
		const v = JSON.parse(fs.readFileSync(STATE, "utf8"));
		if (typeof v?.enabled === "boolean") return v.enabled;
	} catch {
		/* no state yet */
	}
	return (process.env.PI_LEAN_PROSE || "on").trim().toLowerCase() !== "off";
}

function writeEnabled(enabled: boolean): void {
	try {
		fs.mkdirSync(AGENT_DIR, { recursive: true });
		fs.writeFileSync(STATE, JSON.stringify({ enabled }));
	} catch {
		/* best effort — falls back to env next session */
	}
}

let enabled = readEnabled();

export default function leanProse(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event: any) => {
		if (!enabled) return;
		return { systemPrompt: event.systemPrompt + LAYER };
	});

	pi.registerCommand("prose", {
		description: "Toggle lean prose (short, dense output). /prose on | off",
		handler: async (args, ctx) => {
			const a = String(args || "").trim().toLowerCase();
			enabled = a === "on" ? true : a === "off" ? false : !enabled;
			writeEnabled(enabled);
			ctx.ui.notify(`Lean prose ${enabled ? "on" : "off"}.`, "info");
		},
	});
}
