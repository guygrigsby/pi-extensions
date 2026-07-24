/**
 * status-sweeper - keep the footer's extension-status line empty.
 *
 * pi renders a bottom line whenever any extension has pushed a status via
 * ctx.ui.setStatus(key, text) (e.g. ponytail's 🐴 badge). This clears every
 * such key, regardless of which extension set it, so that line never shows.
 *
 * How it reaches "every key": the only public handle to the live status map is
 * the footerData passed to a setFooter() factory. We register a throwaway footer
 * to capture that provider, immediately restore the built-in footer, then read
 * its key set and delete each via the documented setStatus(key, undefined).
 *
 * Sweeps run deferred after the lifecycle events other extensions set status on
 * (so ours lands last), plus a low-frequency interval as the catch-all for
 * statuses pushed at any other time.
 *
 * Config:
 *   PI_STATUS_SWEEPER   off → leave the extension-status line alone.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type StatusProvider = { getExtensionStatuses(): Map<string, unknown> };

const SWEEP_INTERVAL_MS = 1000;

export default function statusSweeper(pi: ExtensionAPI) {
	if ((process.env.PI_STATUS_SWEEPER || "on").trim().toLowerCase() === "off") return;

	let provider: StatusProvider | undefined;
	let lastCtx: any;
	let timer: ReturnType<typeof setInterval> | undefined;

	// Capture the live footer data provider by briefly registering a custom
	// footer (its factory is called synchronously with the provider), then
	// restoring the built-in footer.
	function captureProvider(ctx: any): void {
		if (provider || ctx?.mode !== "tui" || !ctx.ui?.setFooter) return;
		ctx.ui.setFooter((_tui: unknown, _theme: unknown, footerData: StatusProvider) => {
			provider = footerData;
			return { render: () => [], invalidate() {}, dispose() {} };
		});
		ctx.ui.setFooter(undefined); // restore pi's real footer immediately
	}

	function sweep(ctx?: any): void {
		const c = ctx ?? lastCtx;
		if (!provider || !c?.ui?.setStatus) return;
		for (const key of provider.getExtensionStatuses().keys()) {
			c.ui.setStatus(key, undefined);
		}
	}

	// Defer so we run after other extensions' handlers for the same event.
	function sweepSoon(ctx: any): void {
		lastCtx = ctx;
		setTimeout(() => sweep(ctx), 0);
	}

	pi.on("session_start", async (_event, ctx) => {
		if (ctx?.mode !== "tui") return;
		lastCtx = ctx;
		captureProvider(ctx);
		sweepSoon(ctx);
		if (!timer) {
			timer = setInterval(() => sweep(), SWEEP_INTERVAL_MS);
			timer.unref?.();
		}
	});

	pi.on("agent_start", async (_event, ctx) => sweepSoon(ctx));
	pi.on("agent_end", async (_event, ctx) => sweepSoon(ctx));

	pi.on("session_shutdown", async () => {
		if (timer) clearInterval(timer);
		timer = undefined;
		provider = undefined; // re-capture a fresh provider on the next session
	});
}
