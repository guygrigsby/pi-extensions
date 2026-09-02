/**
 * lean-tools — collapse every tool call to a single, subtle dark-gray line.
 *
 *   ▶ Ran shell command
 *   ▶ Read compiler.go
 *   ▶ Edited parser.go (+8 -2)
 *   ▶ Searched "SemanticEditProtocol"
 *
 * Folded is the quiet default (past-tense summary, no command echo, all dim).
 * ctrl+q / `/tools expanded` reveals the real command + full output.
 *
 * pi's built-in tool blocks render a full colored shell (the green/red box).
 * pi-foldable-tools strips the shell but still folds to a 2-line card. This
 * goes one further: one line per completed call, no box, with a ▶/▼ caret.
 *
 * How the single line works: pi renders a tool as renderCall (the call header)
 * + renderResult (the result), two stacked components. To fit the summary
 * (`(+8 -2)`) onto the call line, renderResult needs the call args, which its
 * signature doesn't give it — so renderCall stashes args by toolCallId and
 * renderResult reads them back, emitting the whole line itself while renderCall
 * collapses to empty once the call completes.
 *
 * Controls:
 *   ctrl+q          cycle folded → expanded → hidden
 *   /tools [mode]   set mode directly (folded | expanded | hidden), else cycle
 *   ctrl+o          (built-in) expand output within a row
 *
 * Config:
 *   PI_LEAN_MODE     startup mode: folded (default) | expanded | hidden
 *   PI_LEAN_SKIP     tools to force-skip, e.g. "edit,write" (default: none)
 *   PI_LEAN_PREVIEW  off → folded row stays a single line (default: on — the
 *                    first bit of the result shows in accent under the fold)
 *   PI_LEAN_PREVIEW_WIDTH  plain-char cap for the preview (default: terminal)
 *
 * Sharing tools with other renderers: pi rejects an extension outright when two
 * register the same tool, so lean defers registration to session_start and asks
 * the live registry (pi.getAllTools) who owns each tool first. A tool another
 * extension already registered (pi-tool-display's edit/write diffs, say) is
 * left to it; lean folds the rest. That makes the split automatic — turn a
 * tool on in pi-tool-display's registerToolOverrides and lean backs off, run
 * without pi-tool-display (the pil profile) and lean takes everything.
 * PI_LEAN_SKIP remains as a manual override: skipped tools go to whichever
 * renderer is present, or the built-in box when nobody claims them. The cost
 * of deferring is pre-bind history rendering (a resumed transcript's first
 * paint) falling to the built-in renderer; rows re-render leaned after bind.
 *
 * Adapted from pi-foldable-tools (MIT, earendil-works).
 */

import type {
	ExtensionAPI,
	ToolDefinition,
	ToolRenderContext,
	AgentToolResult,
} from "@earendil-works/pi-coding-agent";
import {
	createReadToolDefinition,
	createBashToolDefinition,
	createEditToolDefinition,
	createWriteToolDefinition,
	createGrepToolDefinition,
	createFindToolDefinition,
	createLsToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	padTool,
	toolTarget,
	foldSummary,
	quietLabel,
	resultText,
	previewLine,
	CARET_FOLDED,
	CARET_EXPANDED,
	LEAN_TOOLS,
	parseSkipList,
	unknownTools,
	ownedElsewhere,
} from "./lean-tools-core.mjs";

type Mode = "folded" | "expanded" | "hidden";
const MODES: Mode[] = ["folded", "expanded", "hidden"];

function readDefaultMode(): Mode {
	const v = (process.env.PI_LEAN_MODE || "").trim().toLowerCase();
	return v === "expanded" || v === "hidden" ? v : "folded";
}

let mode: Mode = readDefaultMode();

// The little preview under the fold — first bit of the result in accent.
// The label says nothing ("Ran shell command"), this is what carries the
// content. width=0 → no width cap; the TUI clips at the terminal edge.
let previewEnabled = (process.env.PI_LEAN_PREVIEW || "on").trim().toLowerCase() !== "off";
function previewWidth(): number {
	const n = parseInt(process.env.PI_LEAN_PREVIEW_WIDTH || "", 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

// Tools handed to another renderer. Read once — pi reloads the extension when
// the environment changes anyway.
const skip = parseSkipList(process.env.PI_LEAN_SKIP);

// Everything lean is leaving to someone else: the forced PI_LEAN_SKIP entries
// plus whatever session_start finds already owned by another extension.
// lean-anytool reads this so it doesn't fold those renderers' rows either.
export const leftAlone = new Set<string>(skip);

// Names lean itself registered. Ownership checks can't tell "another extension
// owns this" from "we registered it last session", so self-owned tools
// re-register unconditionally (refreshes the cwd baked into the factories).
const registeredByLean = new Set<string>();

// Every rendered block's invalidate(), so a mode toggle re-renders the whole
// transcript (past + present), and its args, so renderResult can rebuild the
// call line without re-deriving it from a signature that omits args.
const invalidators = new Map<string, () => void>();
const argsById = new Map<string, unknown>();

function track(context: ToolRenderContext): void {
	if (context.toolCallId) invalidators.set(context.toolCallId, context.invalidate);
}

function rerenderAll(): void {
	for (const inv of invalidators.values()) {
		try {
			inv();
		} catch {
			// Component gone (compaction/session switch) — ignore.
		}
	}
}

// read/grep/find/ls use a Text-based built-in renderer, safe to delegate to for
// the expanded view (keeps syntax highlighting). bash/edit/write use a
// Container + shared state renderer, so delegating crashes on lastComponent
// type mismatch — those are rendered locally as Text.
const DELEGATABLE = new Set(["read", "grep", "find", "ls"]);

function asText(context: ToolRenderContext): Text {
	return (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
}
function setText(context: ToolRenderContext, content: string): Text {
	const t = asText(context);
	t.setText(content);
	return t;
}
function emptyText(context: ToolRenderContext): Text {
	return setText(context, "");
}

function caret(theme: any): string {
	return theme.fg("dim", `${mode === "expanded" ? CARET_EXPANDED : CARET_FOLDED} `);
}

/** `▶ bash   git status` — the bare call line, accent target. Used in expanded. */
function callLine(name: string, args: unknown, theme: any): string {
	const label = theme.fg("toolTitle", theme.bold(padTool(name)));
	const target = theme.fg("accent", toolTarget(name, args));
	return caret(theme) + label + " " + target;
}

/**
 * The folded line — one subtle dark-gray past-tense summary, no command echo:
 *   ▶ Ran shell command
 *   ▶ Edited parser.go (+8 -2)
 *   ▶ Ran shell command  ✗ exit 1
 * Everything dim; only failures take the error color so they still stand out.
 */
function foldedLine(name: string, args: unknown, result: AgentToolResult, isError: boolean, theme: any): string {
	let line = caret(theme) + theme.fg("dim", quietLabel(name, args));
	const s = foldSummary(name, result, isError) as any;
	if (s.tone === "edit" && (s.add || s.rem)) {
		line += theme.fg("dim", ` (+${s.add} -${s.rem})`);
	} else if (s.tone === "error") {
		line += "  " + theme.fg("error", s.text);
	} else if (s.tone === "dim" && s.text) {
		line += theme.fg("dim", ` ${s.text}`);
	}
	return line;
}

/**
 * The accent-colored preview line under the fold: as much of the first
 * meaningful bit of the result as fits. Indented to align with the label,
 * clipped to the configured width (0 = no cap; the TUI clips at the edge).
 */
function previewRow(name: string, result: AgentToolResult, args: unknown, theme: any): string {
	if (!previewEnabled) return "";
	let p = previewLine(name, result, args);
	if (!p) return "";
	const w = previewWidth();
	if (w && p.length > w) p = p.slice(0, Math.max(1, w - 3)) + "...";
	return "\n  " + theme.fg("accent", p);
}
/** Running state: same quiet dim line, no accent, no live output. */
function runningLine(name: string, args: unknown, theme: any): string {
	return caret(theme) + theme.fg("dim", quietLabel(name, args));
}

function expandedOwn(name: string, result: AgentToolResult, isError: boolean, theme: any): string {
	const text = resultText(result);
	const details = (result as any)?.details ?? {};
	if (name === "edit") {
		const diff: string | undefined = details.diff;
		if (typeof diff === "string" && diff) {
			return diff
				.split("\n")
				.map((l) => {
					if (l.startsWith("+") && !l.startsWith("+++")) return theme.fg("success", l);
					if (l.startsWith("-") && !l.startsWith("---")) return theme.fg("error", l);
					return theme.fg("dim", l);
				})
				.join("\n");
		}
		return isError ? theme.fg("error", text.split("\n")[0] || "failed") : theme.fg("success", "applied");
	}
	// bash, write
	const out = text
		? text.split("\n").map((l) => theme.fg("muted", l)).join("\n")
		: theme.fg("success", name === "write" ? "written" : "done");
	let s = out;
	const trunc = details.truncation;
	if (trunc?.truncated) {
		const by = trunc.truncatedBy === "lines" ? `${trunc.outputLines} of ${trunc.totalLines} lines` : `${trunc.outputLines} lines`;
		s += `\n${theme.fg("warning", `[truncated: ${by}]`)}`;
	}
	if (details.fullOutputPath) s += `\n${theme.fg("dim", `full output: ${details.fullOutputPath}`)}`;
	return s;
}

function registerLean(pi: ExtensionAPI, cwd: string): void {
	const factories: Record<string, (cwd: string) => ToolDefinition> = {
		read: createReadToolDefinition,
		bash: createBashToolDefinition,
		edit: createEditToolDefinition,
		write: createWriteToolDefinition,
		grep: createGrepToolDefinition,
		find: createFindToolDefinition,
		ls: createLsToolDefinition,
	};

	let registry: unknown[] | undefined;
	try {
		registry = pi.getAllTools();
	} catch {
		// Pre-bind (shouldn't happen from session_start) — nobody to defer to.
	}

	for (const name of LEAN_TOOLS) {
		// Skipped tools are never registered, so the built-in (or another
		// extension's override) keeps the row.
		if (skip.has(name)) continue;
		// Another extension got here first (pi-tool-display's diff renderer,
		// say). Registering anyway would make pi drop lean entirely.
		if (!registeredByLean.has(name) && ownedElsewhere(registry, name)) {
			leftAlone.add(name);
			continue;
		}
		registeredByLean.add(name);
		const orig = factories[name](cwd);
		pi.registerTool({
			name: orig.name,
			label: orig.label,
			description: orig.description,
			parameters: orig.parameters,
			prepareArguments: orig.prepareArguments,
			executionMode: orig.executionMode,
			renderShell: "self",

			// Behavior identical to the built-in — only rendering changes.
			execute: (toolCallId, params, signal, onUpdate, ctx) => orig.execute(toolCallId, params, signal, onUpdate, ctx),

			renderCall: (args, theme, context) => {
				track(context);
				if (context.toolCallId) argsById.set(context.toolCallId, args);
				if (mode === "hidden" && !context.isPartial) return emptyText(context);
				// While running, this line shows activity. Once complete, the whole
				// single line moves to renderResult, so collapse this to nothing.
				if (!context.isPartial) return emptyText(context);
				// Expanded shows the real command; folded/quiet stays subtle.
				if (mode === "expanded") return setText(context, callLine(name, args, theme));
				return setText(context, runningLine(name, args, theme));
			},

			renderResult: (result, options, theme, context) => {
				track(context);

				if (options.isPartial) {
					// Running: renderCall already shows the line. Keep the result slot
					// quiet — a live bash tail only when expanded, else nothing.
					if (name === "bash" && mode === "expanded") {
						const out = resultText(result);
						const tail = out ? out.split("\n").slice(-6) : [];
						return setText(context, tail.map((l: string) => theme.fg("muted", l)).join("\n"));
					}
					return emptyText(context);
				}

				if (mode === "hidden") return emptyText(context);

				const args = context.toolCallId ? argsById.get(context.toolCallId) : undefined;

				if (mode === "expanded" || options.expanded) {
					if (DELEGATABLE.has(name)) {
						// Original's own rich full output (its own header + syntax
						// highlighting); ctrl+o drives its expansion.
						return orig.renderResult!(result, { ...options, expanded: true }, theme, context);
					}
					const header = callLine(name, args, theme);
					return setText(context, header + "\n" + expandedOwn(name, result, context.isError, theme));
				}

				// folded — the one line, plus the accent preview under it
				const line = foldedLine(name, args, result, context.isError, theme);
				if (name === "edit") return setText(context, line); // counts say enough
				return setText(context, line + previewRow(name, result, args, theme));
			},
		});
	}
}

function applyMode(next: Mode, ctx: { ui: any }): void {
	mode = next;
	rerenderAll();
	try {
		ctx.ui.notify(`Tool blocks: ${mode}`, "info");
	} catch {
		/* ignore */
	}
}

function cycleMode(ctx: { ui: any }): void {
	applyMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length], ctx);
}

export default function leanTools(pi: ExtensionAPI): void {
	// Registration happens in session_start, not here: pi's duplicate-tool check
	// runs over load-time registrations only, and getAllTools (who owns what)
	// is unavailable until the session binds.
	pi.on("session_start", async (_event, ctx) => {
		invalidators.clear();
		argsById.clear();
		registerLean(pi, ctx.cwd ?? process.cwd());
		try {
			ctx.ui.setStatus("lean-tools", undefined); // no persistent badge; mode shows via /tools and the toast on change
			// A misspelled skip entry silently skips nothing; say so rather than
			// leave the user wondering why their setting did nothing.
			const bad = unknownTools(skip);
			if (bad.length) {
				ctx.ui.notify(`PI_LEAN_SKIP: no such tool: ${bad.join(", ")}`, "warning");
			}
		} catch {
			/* ignore */
		}
	});

	pi.registerShortcut("ctrl+q", {
		description: "Cycle tool-block view: folded → expanded → hidden",
		handler: async (ctx) => cycleMode(ctx),
	});

	pi.registerCommand("tools", {
		description: "Set or cycle tool-block view (folded | expanded | hidden)",
		handler: async (args, ctx) => {
			const a = String(args || "").trim().toLowerCase();
			if (a === "folded" || a === "expanded" || a === "hidden") applyMode(a as Mode, ctx);
			else cycleMode(ctx);
		},
	});
}
