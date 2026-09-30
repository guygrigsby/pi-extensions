/**
 * statusline — replace pi's built-in footer with one line:
 *
 *    aperture-completions:z-ai/glm-5.3  pi-extensions   main
 *
 * The built-in footer is a block of token totals, context usage and provider
 * counts. This is the four things worth glancing at mid-session — which model,
 * which repo, which branch — and nothing else.
 *
 * Live values: ctx.model and ctx.cwd are getters resolved at call time, so a
 * mid-session /model switch shows up on the next frame without re-registering.
 * The branch comes from the footer data provider, which watches .git/HEAD.
 *
 * Registration is deferred one tick. An extension that reaches the footer data
 * provider by briefly installing a throwaway footer — status-sweeper does — then
 * calls setFooter(undefined), which restores the built-in footer and would drop
 * this one. Landing last, whatever the package load order, keeps it installed.
 *
 * Config:
 *   PI_STATUSLINE   off → leave pi's built-in footer alone.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { modelLabel, renderStatusline, repoName } from "./statusline-core.mjs";

export default function statusline(pi: ExtensionAPI): void {
	if ((process.env.PI_STATUSLINE || "on").trim().toLowerCase() === "off") return;

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		setTimeout(() => {
			ctx.ui.setFooter((_tui, theme, footerData) => ({
				render(width: number): string[] {
					return [
						renderStatusline(
							theme,
							{
								model: modelLabel(ctx.model),
								repo: repoName(ctx.cwd),
								branch: footerData.getGitBranch() ?? "",
							},
							width,
						),
					];
				},
				invalidate() {},
				dispose() {},
			}));
		}, 0);
	});
}
