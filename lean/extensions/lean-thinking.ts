/**
 * lean-thinking — remove the "Thinking..." label entirely.
 *
 * With hideThinkingBlock on, AssistantMessageComponent.updateContent() still
 * emits one static label per run of hidden thinking blocks:
 *   new Text(theme.italic(theme.fg("thinkingText", this.hiddenThinkingLabel)))
 * Setting the label to "" doesn't remove it — theme.fg wraps it in ANSI codes,
 * so the Text is non-empty and renders a blank escape line.
 *
 * So instead: set the label to an invisible sentinel (rides pi's own plumbing,
 * so both the streaming component and replayed messages pick it up), then patch
 * updateContent to drop the child whose text carries that sentinel. Nothing is
 * shown for thinking at all.
 *
 * ⚠ Patches a pi core internal, same guarded pattern as lean-spacing
 * (feature-detected, idempotent, try/caught) — a pi reshape degrades to the
 * stock "Thinking..." label instead of crashing.
 *
 * Config:
 *   PI_LEAN_THINKING   off → leave pi's default "Thinking..." label alone.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";

// NUL-delimited so it's unique to match and invisible if it ever slips through.
const SENTINEL = "\x00lean-hide-thinking\x00";
const FLAG = "__leanThinkingPatched";

function patch(): void {
	const proto = (AssistantMessageComponent as any)?.prototype;
	if (!proto || typeof proto.updateContent !== "function") return; // shape changed — bail
	if (proto[FLAG]) return; // idempotent across /reload

	const originalUpdate = proto.updateContent;
	proto.updateContent = function patchedUpdate(this: any, message: unknown) {
		const cc = this.contentContainer;
		const realAddChild = cc?.addChild;
		if (cc && typeof realAddChild === "function") {
			cc.addChild = function (child: any) {
				if (typeof child?.text === "string" && child.text.includes(SENTINEL)) return; // drop the thinking label
				return realAddChild.call(this, child);
			};
			try {
				originalUpdate.call(this, message);
			} finally {
				cc.addChild = realAddChild; // restore
			}
		} else {
			originalUpdate.call(this, message);
		}
	};
	proto[FLAG] = true;
}

export default function leanThinking(pi: ExtensionAPI): void {
	if ((process.env.PI_LEAN_THINKING || "on").trim().toLowerCase() === "off") return;
	try {
		patch();
	} catch {
		// Never let a cosmetic patch break startup.
	}
	// Feed pi the sentinel label; the patch above strips the child it produces.
	pi.on("session_start", async (_event, ctx) => {
		try {
			ctx.ui.setHiddenThinkingLabel(SENTINEL);
		} catch {
			/* ignore */
		}
	});
}
