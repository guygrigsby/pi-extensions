/**
 * claude-aliases — Claude-Code-style slash commands for pi.
 *
 *   /exit    quit pi
 *   /clear   clear context (start a new session)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function claudeAliases(pi: ExtensionAPI) {
	pi.registerCommand("exit", {
		description: "Exit pi",
		handler: async (_args, ctx) => {
			ctx.shutdown();
		},
	});

	pi.registerCommand("clear", {
		description: "Clear context (start a new session)",
		handler: async (_args, ctx) => {
			await ctx.newSession();
		},
	});
}
