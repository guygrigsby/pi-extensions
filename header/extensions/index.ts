/**
 * header — replace pi's built-in startup header with a framed two-column box:
 *
 *   ╭─ pi v0.83.0 ──────────────────┬────────────────────────────────╮
 *   │        evening, Guy           │ Tips for getting started       │
 *   │                               │ /hotkeys lists every binding   │
 *   │      ████████████             │ ...                            │
 *   │       ██     ██               │ ────────────────────────────   │
 *   │       ██     ██               │ What's new                     │
 *   │       ██     ██               │ Credential export for ...      │
 *   │       ██     ██▄              │ ...                            │
 *   │   kimi-k3 · high              │                                │
 *   │   ~/projects/pi-extensions    │ /changelog for more            │
 *   ╰───────────────────────────────┴────────────────────────────────╯
 *
 * The frame, title and π are the one place brand color lives — everything else
 * takes theme colors, so a theme can stay neutral and still have a colored box.
 *
 * Requires quietStartup=false in settings.json — setHeader is a no-op when the
 * built-in header is silenced.
 *
 * Config:
 *   PI_HEADER_NAME    name in the greeting (else git user.name, else OS user)
 *   PI_HEADER_COLOR   frame color, #rrggbb (default pink). Anything that isn't
 *                     a hex color, "off" included, falls back to theme accent.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { VERSION, getPackageDir } from "@earendil-works/pi-coding-agent";
import {
	ANSI_FG_RESET,
	changelogHighlights,
	columnWidths,
	greetingName,
	hexToFg,
	layoutBox,
	MAX_BOX_WIDTH,
	pickTips,
	shortPath,
	timeOfDay,
} from "./header-core.mjs";

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
const HOME = os.homedir();
const DEFAULT_BRAND = "#ff4fa3";

// Big block π: overhang bar + two legs, the right leg with a serif foot.
// Every line is the same width so centering keeps the art aligned.
const PI_GLYPH = [
	" ████████████ ",
	"  ██     ██   ",
	"  ██     ██   ",
	"  ██     ██   ",
	"  ██     ██▄  ",
];

const TIPS = [
	"/hotkeys lists every key binding",
	"/model switches model mid-session",
	"/tree browses this session's branches",
	"/fork branches from an earlier message",
	"/compact summarizes to free context",
	"/resume picks up an earlier session",
	"/export writes the session to HTML",
];

/** Newest release's headlines, read once from the installed pi. */
function readHighlights(): string[] {
	try {
		return changelogHighlights(readFileSync(join(getPackageDir(), "CHANGELOG.md"), "utf8"), 2);
	} catch {
		return [];
	}
}
const HIGHLIGHTS = readHighlights();

// Which tips show, rotating by the day so the box isn't the same every morning.
function dayIndex(now: Date): number {
	return Math.floor(now.getTime() / 86_400_000);
}

type Cell = { text: string; align?: "center"; style?: (s: string) => string };

let modelLine = "";

export default function header(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		const model = (ctx.model as any)?.id ?? (ctx.model as any)?.name ?? "";
		const thinking = ctx.thinkingLevel ?? "";
		modelLine = [model, thinking].filter(Boolean).join(" · ");
		const cwd = ctx.cwd ?? process.cwd();
		const now = new Date();

		ctx.ui.setHeader((_tui, theme) => ({
			render(width: number): string[] {
				const fg = hexToFg(process.env.PI_HEADER_COLOR ?? DEFAULT_BRAND);
				// No truecolor hex to honor: borrow the theme's accent instead.
				const brand = fg
					? (s: string) => fg + s + ANSI_FG_RESET
					: (s: string) => theme.fg("accent", s);
				const dim = (s: string) => theme.fg("dim", s);
				const muted = (s: string) => theme.fg("muted", s);
				const label = (s: string) => theme.fg("accent", theme.bold(s));

				// Same cap layoutBox applies, so the rule matches its column.
				const cols = columnWidths(Math.min(width, MAX_BOX_WIDTH));
				const rightW = cols?.rightW ?? 0;

				const left: Cell[] = [
					{ text: `${timeOfDay(now.getHours())}, ${NAME}`, align: "center", style: (s) => theme.bold(s) },
					{ text: "" },
					...PI_GLYPH.map((l): Cell => ({ text: l, align: "center", style: brand })),
					{ text: "" },
					{ text: modelLine, align: "center", style: dim },
					{ text: shortPath(cwd, HOME, cols?.leftW ?? width), align: "center", style: dim },
				];

				const tips = pickTips(TIPS, 2, dayIndex(now));
				const right: Cell[] = [
					{ text: "Tips for getting started", style: label },
					...tips.map((t): Cell => ({ text: t, style: muted })),
					{ text: "" },
					{ text: "─".repeat(Math.max(0, rightW)), style: (s) => theme.fg("borderMuted", s) },
				];
				if (HIGHLIGHTS.length) {
					right.push(
						{ text: `What's new in ${VERSION}`, style: label },
						...HIGHLIGHTS.map((h): Cell => ({ text: h, style: muted })),
						{ text: "" },
						{ text: "/changelog for more", style: dim },
					);
				}

				const box = layoutBox({ title: `pi v${VERSION}`, left, right, width, style: { border: brand, title: brand } });
				if (box) return ["", ...box];

				// Too narrow to frame: the plain glyph and greeting, as before.
				const side = ["", `${timeOfDay(now.getHours())}, ${NAME}`, "", "", ""];
				return ["", ...PI_GLYPH.map((l, i) => brand(l) + (side[i] ? "   " + muted(side[i]) : ""))];
			},
			invalidate() {},
		}));
	});
}
