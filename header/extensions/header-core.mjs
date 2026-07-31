/**
 * header-core — pure formatting for the startup header.
 *
 * No pi/theme imports so it's unit-testable with plain strings. The .ts
 * extension supplies colors and the git/os lookups around these pieces.
 *
 * Cell text is plain: styling is a function the caller passes per cell, applied
 * after the cell is fitted to its column, so widths never count escape bytes.
 */

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

export const ANSI_FG_RESET = "\x1b[39m";

/** Below this the box is more noise than frame, so the caller draws plain. */
export const MIN_BOX_WIDTH = 46;
/** Below this two columns leave nothing readable in either, so they stack. */
export const MIN_TWO_COL_WIDTH = 80;
/** Past this the box stops growing: a 200-column frame is all frame. */
export const MAX_BOX_WIDTH = 120;

// │ + space + left + space + │ + space + right + space + │
const TWO_COL_FRAME = 7;
// │ + space + content + space + │
const ONE_COL_FRAME = 4;
const LEFT_SHARE = 0.4;
const LEFT_MIN = 26;
const LEFT_MAX = 46;
const RIGHT_MIN = 20;

export function stripAnsi(s) {
	return String(s ?? "").replace(ANSI_PATTERN, "");
}

export function visibleWidth(s) {
	return stripAnsi(s).length;
}

/** Plain text padded or ellipsis-truncated to exactly `w` columns. */
export function fit(text, w) {
	const s = String(text ?? "");
	if (w <= 0) return "";
	if (s.length === w) return s;
	if (s.length < w) return s + " ".repeat(w - s.length);
	return w === 1 ? "…" : s.slice(0, w - 1) + "…";
}

/** Column widths for the two-column box, or null when the terminal is too narrow. */
export function columnWidths(width) {
	if (width < MIN_TWO_COL_WIDTH) return null;
	const inner = width - TWO_COL_FRAME;
	const leftW = Math.min(LEFT_MAX, Math.max(LEFT_MIN, Math.round(inner * LEFT_SHARE)));
	const rightW = inner - leftW;
	return rightW < RIGHT_MIN ? null : { leftW, rightW };
}

const identity = (s) => s;

function resolveStyle(style) {
	return { border: style?.border ?? identity, title: style?.title ?? identity };
}

function renderCell(cell, w) {
	if (!cell) return " ".repeat(w);
	const text = String(cell.text ?? "");
	const lead = cell.align === "center" ? Math.max(0, Math.floor((w - text.length) / 2)) : 0;
	const body = fit(" ".repeat(lead) + text, w);
	return cell.style ? cell.style(body) : body;
}

/**
 * Top border with the title inset: `╭─ pi v0.83.0 ─────┬─────╮`.
 * `dividerAt` is the width of the left segment, or null for one column.
 */
function topBorder(width, title, leftSeg, style) {
	const s = resolveStyle(style);
	const rightSeg = leftSeg === null ? null : width - leftSeg - 3;
	const firstSeg = leftSeg === null ? width - 2 : leftSeg;
	const label = title ? `─ ${title} ` : "";
	const shown = label.length > firstSeg ? "" : label;
	const head = shown
		? s.border("─ ") + s.title(title) + s.border(" ")
		: "";
	let out = s.border("╭") + head + s.border("─".repeat(firstSeg - shown.length));
	if (rightSeg !== null) out += s.border("┬") + s.border("─".repeat(rightSeg));
	return out + s.border("╮");
}

function bottomBorder(width, leftSeg, style) {
	const s = resolveStyle(style);
	if (leftSeg === null) return s.border("╰" + "─".repeat(width - 2) + "╯");
	const rightSeg = width - leftSeg - 3;
	return s.border("╰" + "─".repeat(leftSeg) + "┴" + "─".repeat(rightSeg) + "╯");
}

/**
 * The startup box: rounded frame, version inset in the top border, two columns
 * split by a full-height divider. Returns null when the terminal is too narrow
 * to frame anything, so the caller can fall back to a plain header.
 */
export function layoutBox({ title, left = [], right = [], width, style }) {
	if (width < MIN_BOX_WIDTH) return null;
	const s = resolveStyle(style);
	// Wide terminals get a fixed-width box rather than a stretched one.
	const boxW = Math.min(width, MAX_BOX_WIDTH);
	const cols = columnWidths(boxW);

	if (!cols) {
		// One column: the right block stacks under the left with a blank between.
		const inner = boxW - ONE_COL_FRAME;
		const cells = left.length && right.length ? [...left, { text: "" }, ...right] : [...left, ...right];
		const rows = cells.map((c) => s.border("│") + " " + renderCell(c, inner) + " " + s.border("│"));
		return [topBorder(boxW, title, null, style), ...rows, bottomBorder(boxW, null, style)];
	}

	const { leftW, rightW } = cols;
	const height = Math.max(left.length, right.length);
	const rows = [];
	for (let i = 0; i < height; i++) {
		rows.push(
			s.border("│") +
				" " +
				renderCell(left[i], leftW) +
				" " +
				s.border("│") +
				" " +
				renderCell(right[i], rightW) +
				" " +
				s.border("│"),
		);
	}
	return [topBorder(boxW, title, leftW + 2, style), ...rows, bottomBorder(boxW, leftW + 2, style)];
}

/** `n` tips starting at `seed`, wrapping, never repeating within one draw. */
export function pickTips(tips, n, seed) {
	if (!tips.length) return [];
	const take = Math.min(n, tips.length);
	const start = ((seed % tips.length) + tips.length) % tips.length;
	return Array.from({ length: take }, (_, i) => tips[(start + i) % tips.length]);
}

function bulletTitle(body) {
	const bold = body.match(/^\*\*(.+?)\*\*/);
	if (bold) return bold[1];
	return body
		.replace(/\s*\(\[#\d+\]\([^)]*\)[^)]*\)/g, "")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/`/g, "")
		.replace(/\.\s*$/, "")
		.trim()
		.slice(0, 60);
}

/**
 * Feature titles from the newest release in a keep-a-changelog file. Prefers a
 * "New Features" section, falls back to "Added", and gives up rather than
 * inventing a headline out of bug fixes.
 */
export function changelogHighlights(md, max) {
	const lines = String(md ?? "").split("\n");
	const start = lines.findIndex((l) => l.startsWith("## "));
	if (start < 0) return [];
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((l) => l.startsWith("## "));
	const release = end < 0 ? rest : rest.slice(0, end);

	for (const wanted of ["### New Features", "### Added"]) {
		const at = release.findIndex((l) => l.trim() === wanted);
		if (at < 0) continue;
		const out = [];
		for (const line of release.slice(at + 1)) {
			if (line.startsWith("### ")) break;
			const m = line.match(/^-\s+(.*)$/);
			if (m) out.push(bulletTitle(m[1]));
			if (out.length >= max) break;
		}
		if (out.length) return out;
	}
	return [];
}

/**
 * A path for the header: `$HOME` as `~`, and truncated from the left when it
 * doesn't fit, since the tail of a path is the part worth reading.
 */
export function shortPath(p, home, w) {
	let s = String(p ?? "");
	if (home && s.startsWith(home)) s = "~" + s.slice(home.length);
	if (!w || s.length <= w) return s;
	return w <= 1 ? "…" : "…" + s.slice(s.length - (w - 1));
}

/** A truecolor foreground escape for `#rrggbb`, or null if that isn't one. */
export function hexToFg(hex) {
	const s = String(hex ?? "").trim().replace(/^#/, "");
	if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
	return `\x1b[38;2;${r};${g};${b}m`;
}

export function timeOfDay(hour) {
	if (hour < 5) return "late night";
	if (hour < 12) return "morning";
	if (hour < 18) return "afternoon";
	return "evening";
}

function firstToken(s) {
	return String(s ?? "").trim().split(/\s+/)[0] ?? "";
}

function capitalize(s) {
	return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * The greeting name: first token of the first non-empty source, capitalized.
 * Sources in priority order, e.g. (PI_HEADER_NAME, git user.name, os username):
 *   "Guy J Grigsby" → "Guy",  "guygrigsby" → "Guygrigsby".
 */
export function greetingName(...sources) {
	for (const src of sources) {
		const tok = firstToken(src);
		if (tok) return capitalize(tok);
	}
	return "there";
}
