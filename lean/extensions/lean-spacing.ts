/**
 * lean-spacing — strip the blank lines between transcript blocks.
 *
 * AssistantMessageComponent.updateContent() interleaves its content with
 * `new Spacer(1)` (one blank line) before the text, between each tool call, and
 * around abort/error notices — that's the vertical gap you see between folded
 * ▶ tool rows and around assistant turns. The spacer count is hardcoded with no
 * setting.
 *
 * This wraps updateContent and, while it runs, drops any Spacer as it's added
 * to the content container — no blank-line trimming of rendered output (which
 * would also eat markdown paragraph breaks), just the structural spacers. Other
 * components (dialogs, selectors) are untouched.
 *
 * ⚠ Patches a pi core internal. Guarded (feature-detected, idempotent,
 * try/caught) so a pi update that reshapes the component degrades to the stock
 * spacing instead of crashing.
 *
 * Config:
 *   PI_LEAN_SPACING   off → leave pi's default (spaced) transcript alone.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";
import { Spacer } from "@earendil-works/pi-tui";

const FLAG = "__leanSpacingPatched";

function isSpacer(c: any): boolean {
	return c instanceof Spacer || c?.constructor?.name === "Spacer" || (c && typeof c.setLines === "function" && "lines" in c);
}

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
				if (isSpacer(child)) return; // drop the blank-line spacer
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

export default function leanSpacing(_pi: ExtensionAPI): void {
	if ((process.env.PI_LEAN_SPACING || "on").trim().toLowerCase() === "off") return;
	try {
		patch();
	} catch {
		// Never let a cosmetic patch break startup.
	}
}
