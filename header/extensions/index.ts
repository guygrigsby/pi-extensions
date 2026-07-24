/**
 * header — replace the built-in startup header with a big block π, the version,
 * and a time-of-day greeting to its right:
 *
 *    ████████████
 *     ██     ██      PI v0.81.1
 *     ██     ██      evening, Guy
 *     ██     ██
 *     ██     ██▄
 *
 * Requires quietStartup=false in settings.json — setHeader is a no-op when the
 * built-in header is silenced.
 *
 * The greeting name comes from PI_HEADER_NAME, else git `user.name`, else the OS
 * username (first token, capitalized). Set PI_HEADER_NAME to override.
 */

import { execFileSync } from "node:child_process";
import os from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { timeOfDay, greetingName } from "./header-core.mjs";

function gitUserName(): string {
	try {
		return execFileSync("git", ["config", "user.name"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "";
	}
}

// Resolved once at load — cheap, and the name doesn't change mid-session.
const NAME = greetingName(process.env.PI_HEADER_NAME, gitUserName(), os.userInfo().username);

// Big block π: overhang bar + two legs, the right leg with a serif foot.
const PI_GLYPH = [
	" ████████████ ",
	"  ██     ██   ",
	"  ██     ██   ",
	"  ██     ██   ",
	"  ██     ██▄  ",
];
const GAP = "   ";

export default function header(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setHeader((_tui, theme) => ({
			render(_width: number): string[] {
				const title =
					theme.bold(theme.fg("accent", "PI")) + theme.fg("dim", ` v${VERSION}`);
				const greeting = theme.fg(
					"muted",
					`${timeOfDay(new Date().getHours())}, ${NAME}`,
				);
				// Title + greeting sit to the right of the glyph, on its two center legs.
				const side = ["", title, greeting, "", ""];
				const rows = PI_GLYPH.map(
					(l, i) => theme.fg("accent", l) + (side[i] ? GAP + side[i] : ""),
				);
				return ["", ...rows];
			},
			invalidate() {},
		}));
	});
}
