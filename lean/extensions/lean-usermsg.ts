/**
 * lean-usermsg — make the user message a thin, tinted, one-line bar.
 *
 * pi's default user message (UserMessageComponent) wraps its text in a
 * Box(paddingX, paddingY=1) — that hardcoded paddingY=1 puts a blank tinted
 * line above and below the text, so a one-word message is three lines tall. The
 * component exposes no setter for vertical padding (setOutputPad only touches
 * paddingX), so the only lever is the component itself.
 *
 * This wraps UserMessageComponent.prototype.rebuild and, while the original
 * runs, intercepts the content Box as it's added and sets paddingY = 0 — no
 * dependency on Container's internal field names, and the Box's background
 * closure (the tint) is left intact. Result: a single tinted line, no frame.
 *
 * ⚠ This patches a pi core internal. It's guarded (feature-detected, idempotent,
 * try/caught) so a pi update that reshapes the component degrades to the stock
 * render instead of crashing. The real fix is a configurable user-message
 * paddingY upstream in pi; this is the working stopgap.
 *
 * Config:
 *   PI_LEAN_USERMSG   off → leave pi's default (padded) user message alone.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { UserMessageComponent } from "@earendil-works/pi-coding-agent";

const FLAG = "__leanUserMsgPatched";

function patch(): void {
	const proto = (UserMessageComponent as any)?.prototype;
	if (!proto || typeof proto.rebuild !== "function") return; // shape changed — bail
	if (proto[FLAG]) return; // already patched (idempotent across /reload)

	const originalRebuild = proto.rebuild;
	proto.rebuild = function patchedRebuild(this: any) {
		const realAddChild = this.addChild;
		if (typeof realAddChild === "function") {
			// Zero the content Box's vertical padding as it's attached.
			this.addChild = function (child: any) {
				if (child && typeof child.paddingY === "number") child.paddingY = 0;
				return realAddChild.call(this, child);
			};
			try {
				originalRebuild.call(this);
			} finally {
				this.addChild = realAddChild; // restore the prototype method
			}
		} else {
			originalRebuild.call(this);
		}
	};
	proto[FLAG] = true;
}

export default function leanUserMsg(_pi: ExtensionAPI): void {
	if ((process.env.PI_LEAN_USERMSG || "on").trim().toLowerCase() === "off") return;
	try {
		patch();
	} catch {
		// Never let a cosmetic patch break startup.
	}
}
