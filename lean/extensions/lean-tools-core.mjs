/**
 * lean-tools-core — pure formatting for the one-line tool fold.
 *
 * No pi/theme imports here so the logic is unit-testable with plain strings.
 * The .ts extension supplies colors and carets around these pieces.
 *
 * Adapted from pi-foldable-tools (MIT, earendil-works) — that extension folds
 * to a 2-line card; this collapses the whole thing to a single line.
 */

/** The built-in tools lean re-registers, in registration order. */
export const LEAN_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];

/**
 * Tools lean should leave alone, from a `PI_LEAN_SKIP=edit,write` style list.
 * Hands those rows to whatever else registers them (pi-tool-display's
 * syntax-highlighted diffs, say) while lean keeps folding the rest.
 */
export function parseSkipList(raw) {
	return new Set(
		String(raw ?? "")
			.split(",")
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean),
	);
}

/**
 * Skip entries that name no tool lean owns. A typo would otherwise skip nothing
 * and look like the setting was ignored, so the caller surfaces these.
 */
export function unknownTools(skip) {
	return [...skip].filter((name) => !LEAN_TOOLS.includes(name));
}

/**
 * Whether the generic one-line fold applies to a tool row. Skipped tools are
 * left whole: handing `edit` to another renderer is pointless if the row that
 * renderer draws then gets collapsed to a line anyway.
 */
export function shouldCompactRow({ toolName, hidden, expanded, renderShell }, skip) {
	if (hidden || expanded) return false;
	if (renderShell === "self") return false;
	return !skip.has(String(toolName ?? "").toLowerCase());
}

// Column width tool labels pad to, so targets line up:
//   ▶ bash   git status
//   ▶ read   compiler.go
//   ▶ edit   parser.go (+8 -2)
const TOOL_COL = 5;

export function padTool(name) {
	return name.length >= TOOL_COL ? name + " " : name.padEnd(TOOL_COL, " ");
}

/** The target shown after the tool label: the command, path, or pattern. */
export function toolTarget(name, args) {
	const a = args ?? {};
	switch (name) {
		case "bash": {
			const cmd = String(a.command ?? "");
			return cmd.length > 120 ? cmd.slice(0, 117) + "..." : cmd;
		}
		case "grep":
			return String(a.pattern ?? "");
		case "find":
			return String(a.path ?? "") + (a.pattern ? ` ${a.pattern}` : "");
		case "read":
		case "edit":
		case "write":
		case "ls":
			return String(a.path ?? "");
		default:
			return "";
	}
}

export function resultText(result) {
	const content = (result?.content ?? []);
	return content
		.filter((c) => c && c.type === "text")
		.map((c) => c.text ?? "")
		.join("\n");
}

export function lineCount(s) {
	return s ? s.split("\n").length : 0;
}

/** Count +/- lines in a unified diff, ignoring the +++/--- file headers. */
export function editCounts(diff) {
	let add = 0;
	let rem = 0;
	if (typeof diff !== "string") return { add, rem };
	for (const l of diff.split("\n")) {
		if (l.startsWith("+") && !l.startsWith("+++")) add++;
		else if (l.startsWith("-") && !l.startsWith("---")) rem++;
	}
	return { add, rem };
}

/**
 * The inline suffix on the folded line. Intentionally minimal so a folded
 * transcript reads like the reference (`▶ edit parser.go (+8 -2)`): edits show
 * their diff counts, failures show why, everything else stays bare.
 *
 * Returns { text, tone }:
 *   tone: "edit" → {add,rem} in add/rem colors (text carries the parts)
 *         "error" → red
 *         "" → no suffix
 * For "edit" tone, `add`/`rem` are returned for the caller to color separately.
 */
export function foldSummary(name, result, isError) {
	if (isError) {
		const text = resultText(result);
		if (name === "bash") {
			const m = text.match(/exited with code (\d+)/);
			if (m) return { tone: "error", text: `✗ exit ${m[1]}` };
		}
		const first = (text.split("\n")[0] || "failed").trim();
		const msg = first.length > 60 ? first.slice(0, 57) + "..." : first;
		return { tone: "error", text: `✗ ${msg}` };
	}
	if (name === "edit") {
		const { add, rem } = editCounts(result?.details?.diff);
		return { tone: "edit", add, rem };
	}
	if (name === "write") {
		const n = lineCount(resultText(result));
		return { tone: "dim", text: n ? `(${n} lines)` : "" };
	}
	return { tone: "", text: "" };
}

export const CARET_FOLDED = "▶";
export const CARET_EXPANDED = "▼";

function basename(p) {
	const s = String(p ?? "").replace(/\/+$/, "");
	const i = s.lastIndexOf("/");
	return i >= 0 ? s.slice(i + 1) : s;
}

/**
 * The quiet, past-tense summary shown for a completed call in folded mode:
 * one dark-gray line, no command echo (Claude-Code style). Deliberately terse —
 * a file basename where useful, nothing where the tool speaks for itself.
 *
 *   bash  → Ran shell command
 *   read  → Read parser.go
 *   edit  → Edited parser.go
 *   grep  → Searched "SemanticEdit"
 */
export function quietLabel(name, args) {
	const a = args ?? {};
	switch (name) {
		case "bash":
			return "Ran shell command";
		case "read":
			return `Read ${basename(a.path)}`;
		case "edit":
			return `Edited ${basename(a.path)}`;
		case "write":
			return `Wrote ${basename(a.path)}`;
		case "grep":
			return `Searched "${String(a.pattern ?? "")}"`;
		case "find":
			return "Searched files";
		case "ls":
			return `Listed ${basename(a.path) || "directory"}`;
		default:
			return name;
	}
}
