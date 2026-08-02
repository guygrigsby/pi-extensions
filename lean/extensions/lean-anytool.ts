/**
 * lean-anytool — collapse EVERY other tool's block to one dark-gray line.
 *
 * lean-tools only restyles the seven built-ins (read/bash/edit/…). Tools that
 * other extensions register — session_search, memory_search, MCP tools — fall
 * through to pi's default ToolExecutionComponent, which paints the full green
 * success box with the whole result inside. Those are the "huge search blocks".
 *
 * This patches ToolExecutionComponent.render so any tool using the DEFAULT shell
 * (getRenderShell() !== "self") collapses to a single dim line:
 *   ▶ session_search  Found 1 results for "input bar"
 * Lean's own self-rendered tools are skipped (they handle themselves), and an
 * expanded row (ctrl+o) still falls through to the full box.
 *
 * No theme is exported to extensions, so the dim styling is raw ANSI — which is
 * exactly the "dark gray and subtle" look wanted. Errors take red so failures
 * still stand out.
 *
 * ⚠ Patches a pi core internal, same guarded pattern as lean-spacing/-thinking.
 *
 * Config:
 *   PI_LEAN_ANYTOOL   off → leave other tools' full boxes alone.
 *   PI_LEAN_SKIP      tools left whole, via the shared leftAlone set —
 *                     which also carries the tools lean-tools auto-deferred
 *                     to another extension's renderer.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { shouldCompactRow } from "./lean-tools-core.mjs";
// The live "leave these alone" set: PI_LEAN_SKIP plus tools lean-tools found
// already owned by another extension at session_start. Folding those rows here
// would throw away the renderer they were handed to.
import { leftAlone as skip } from "./lean-tools";

const FLAG = "__leanAnyToolPatched";

const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;
const ERR = (s: string) => `\x1b[31m${s}\x1b[0m`;

function compactLines(self: any, width: number): string[] {
	const name = String(self.toolName ?? "tool");
	if (self.isPartial || !self.result) {
		return ["", DIM(`▶ ${name}…`)];
	}
	let out = "";
	try {
		out = self.getTextOutput?.() ?? "";
	} catch {
		/* ignore */
	}
	const first = out.split("\n").map((l: string) => l.trim()).find(Boolean) ?? "";
	const plain = `▶ ${name}` + (first ? `  ${first}` : "");
	const line = truncateToWidth(plain, Math.max(1, width), "...");
	return ["", self.result?.isError ? ERR(line) : DIM(line)];
}

function patch(): void {
	const proto = (ToolExecutionComponent as any)?.prototype;
	if (!proto || typeof proto.render !== "function") return; // shape changed — bail
	if (proto[FLAG]) return; // idempotent across /reload

	const originalRender = proto.render;
	proto.render = function patchedRender(this: any, width: number): string[] {
		try {
			if (
				typeof this.getRenderShell === "function" &&
				shouldCompactRow(
					{
						toolName: this.toolName,
						hidden: this.hideComponent,
						expanded: this.expanded,
						renderShell: this.getRenderShell(),
					},
					skip,
				)
			) {
				return compactLines(this, width);
			}
		} catch {
			// fall through to the stock render on any surprise
		}
		return originalRender.call(this, width);
	};
	proto[FLAG] = true;
}

export default function leanAnyTool(_pi: ExtensionAPI): void {
	if ((process.env.PI_LEAN_ANYTOOL || "on").trim().toLowerCase() === "off") return;
	try {
		patch();
	} catch {
		// Never let a cosmetic patch break startup.
	}
}
