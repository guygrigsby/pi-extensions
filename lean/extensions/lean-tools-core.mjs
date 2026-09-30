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

/** Nerd Font glyph per tool, so the folded row leads with the operation's icon. */
export const TOOL_ICONS = {
	read: "\uF02D", // nf-fa-book
	bash: "\uF120", // nf-fa-terminal
	edit: "\uF040", // nf-fa-pencil
	write: "\uF0C7", // nf-fa-floppy_o (save)
	grep: "\uF002", // nf-fa-search
	find: "\uF07B", // nf-fa-folder
	ls: "\uF03A", // nf-fa-list
};

/** The glyph for a tool's folded row, with a safe fallback for unknown names. */
export function toolIcon(name) {
	return TOOL_ICONS[name] ?? "•";
}

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
 * Whether another extension already owns `name` in the live tool registry
 * (pi.getAllTools() output). Lean defers to it instead of double-registering —
 * pi rejects the whole extension on a duplicate tool. Mirrors pi-tool-display's
 * own ownership check, so whichever of the two loads second backs off.
 * A missing registry (pre-bind), a missing tool or a "builtin" source all mean
 * nobody to defer to: register.
 */
export function ownedElsewhere(allTools, name) {
	const tool = (allTools ?? []).find((t) => t?.name === name);
	const source = tool?.sourceInfo?.source;
	return Boolean(source && source !== "builtin");
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

// Longest a folded command/target runs before it is clipped, so the label and
// summary stay visible on a narrow terminal.
const MAX_CMD = 60;

/**
 * The muted command/target shown to the left of the folded label, truncated so
 * the past-tense summary never gets pushed off a narrow terminal.
 */
export function foldedCommand(name, args) {
	const t = toolTarget(name, args);
	return t.length > MAX_CMD ? t.slice(0, MAX_CMD - 1) + "…" : t;
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
 * transcript reads like the reference (`[pencil] parser.go  Edited (+8 -2)`):
 * edits show their diff counts, failures show why, everything else stays bare.
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

/**
 * The quiet, past-tense summary shown for a completed call in folded mode.
 * The target itself (command, path, pattern) now sits to the left of this,
 * muted, so the label is just the verb:
 *
 *   bash  → Ran shell command
 *   read  → Read
 *   edit  → Edited
 *   grep  → Searched
 */
export function quietLabel(name) {
	switch (name) {
		case "bash":
			return "Ran shell command";
		case "read":
			return "Read";
		case "edit":
			return "Edited";
		case "write":
			return "Wrote";
		case "grep":
			return "Searched";
		case "find":
			return "Searched files";
		case "ls":
			return "Listed";
		default:
			return name;
	}
}
