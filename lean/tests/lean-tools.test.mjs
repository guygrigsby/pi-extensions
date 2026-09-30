import { test } from "node:test";
import assert from "node:assert/strict";
import {
	padTool,
	toolTarget,
	foldedCommand,
	editCounts,
	foldSummary,
	quietLabel,
	resultText,
	lineCount,
	toolIcon,
	TOOL_ICONS,
	parseSkipList,
	unknownTools,
	shouldCompactRow,
	ownedElsewhere,
	LEAN_TOOLS,
} from "../extensions/lean-tools-core.mjs";

test("parseSkipList: comma list, case and space tolerant", () => {
	assert.deepEqual([...parseSkipList("edit,write")], ["edit", "write"]);
	assert.deepEqual([...parseSkipList("  Edit , WRITE ,, ")], ["edit", "write"]);
	assert.deepEqual([...parseSkipList("edit,edit")], ["edit"]);
});

test("parseSkipList: nothing skipped by default", () => {
	assert.equal(parseSkipList("").size, 0);
	assert.equal(parseSkipList(undefined).size, 0);
	assert.equal(parseSkipList(null).size, 0);
});

test("unknownTools flags typos so a silent no-op is visible", () => {
	assert.deepEqual(unknownTools(parseSkipList("edit,write")), []);
	assert.deepEqual(unknownTools(parseSkipList("edtit,write")), ["edtit"]);
	assert.deepEqual(unknownTools(new Set()), []);
});

test("shouldCompactRow leaves skipped tools to their own renderer", () => {
	const skip = parseSkipList("edit,write");
	const row = { toolName: "edit", renderShell: "default" };
	assert.equal(shouldCompactRow(row, skip), false);
	assert.equal(shouldCompactRow({ toolName: "session_search", renderShell: "default" }, skip), true);
	assert.equal(shouldCompactRow({ toolName: "EDIT", renderShell: "default" }, skip), false);
});

test("shouldCompactRow respects hidden, expanded and self-rendered rows", () => {
	const none = parseSkipList("");
	assert.equal(shouldCompactRow({ toolName: "grep", renderShell: "default" }, none), true);
	assert.equal(shouldCompactRow({ toolName: "grep", renderShell: "self" }, none), false);
	assert.equal(shouldCompactRow({ toolName: "grep", renderShell: "default", expanded: true }, none), false);
	assert.equal(shouldCompactRow({ toolName: "grep", renderShell: "default", hidden: true }, none), false);
});

test("ownedElsewhere: another extension's registration defers the tool", () => {
	const registry = [
		{ name: "edit", sourceInfo: { source: "extension", path: "/x/pi-tool-display/index.ts" } },
		{ name: "write", sourceInfo: { source: "extension", path: "/x/pi-tool-display/index.ts" } },
		{ name: "read", sourceInfo: { source: "builtin" } },
		{ name: "bash" },
	];
	assert.equal(ownedElsewhere(registry, "edit"), true);
	assert.equal(ownedElsewhere(registry, "write"), true);
	assert.equal(ownedElsewhere(registry, "read"), false);
	// No sourceInfo at all reads as builtin: registering is safe.
	assert.equal(ownedElsewhere(registry, "bash"), false);
	// Absent from the registry entirely: nothing to defer to.
	assert.equal(ownedElsewhere(registry, "grep"), false);
});

test("ownedElsewhere: no registry (pre-bind) means register everything", () => {
	assert.equal(ownedElsewhere(undefined, "edit"), false);
	assert.equal(ownedElsewhere(null, "write"), false);
	assert.equal(ownedElsewhere([], "edit"), false);
});

test("LEAN_TOOLS is the tool set lean owns", () => {
	assert.deepEqual(LEAN_TOOLS, ["read", "bash", "edit", "write", "grep", "find", "ls"]);
});

test("toolIcon maps each lean tool to its Nerd Font glyph", () => {
	assert.equal(toolIcon("read"), "\uF02D");
	assert.equal(toolIcon("bash"), "\uF120");
	assert.equal(toolIcon("edit"), "\uF040");
	assert.equal(toolIcon("write"), "\uF0C7");
	assert.equal(toolIcon("grep"), "\uF002");
	assert.equal(toolIcon("find"), "\uF07B");
	assert.equal(toolIcon("ls"), "\uF03A");
	assert.equal(toolIcon("unknown"), "•");
});

test("TOOL_ICONS covers every tool lean owns", () => {
	for (const name of LEAN_TOOLS) assert.ok(TOOL_ICONS[name], `missing icon for ${name}`);
});

test("quietLabel: past-tense verb, target lives in the command column", () => {
	assert.equal(quietLabel("bash"), "Ran shell command");
	assert.equal(quietLabel("read"), "Read");
	assert.equal(quietLabel("edit"), "Edited");
	assert.equal(quietLabel("write"), "Wrote");
	assert.equal(quietLabel("grep"), "Searched");
	assert.equal(quietLabel("find"), "Searched files");
	assert.equal(quietLabel("ls"), "Listed");
	assert.equal(quietLabel("unknown"), "unknown");
});

test("padTool aligns short names, keeps long ones", () => {
	assert.equal(padTool("ls"), "ls   ");
	assert.equal(padTool("bash"), "bash ");
	assert.equal(padTool("write"), "write ");
});

test("toolTarget picks the right arg per tool", () => {
	assert.equal(toolTarget("bash", { command: "git status" }), "git status");
	assert.equal(toolTarget("read", { path: "compiler.go" }), "compiler.go");
	assert.equal(toolTarget("grep", { pattern: "SemanticEditProtocol" }), "SemanticEditProtocol");
	assert.equal(toolTarget("find", { path: "src", pattern: "*.go" }), "src *.go");
	assert.equal(toolTarget("edit", { path: "parser.go" }), "parser.go");
});

test("toolTarget truncates long bash commands", () => {
	const long = "x".repeat(200);
	const out = toolTarget("bash", { command: long });
	assert.equal(out.length, 120);
	assert.ok(out.endsWith("..."));
});

test("foldedCommand returns the target untruncated when short", () => {
	assert.equal(foldedCommand("bash", { command: "git status" }), "git status");
	assert.equal(foldedCommand("read", { path: "compiler.go" }), "compiler.go");
	assert.equal(foldedCommand("grep", { pattern: "SemanticEdit" }), "SemanticEdit");
});

test("foldedCommand truncates long commands to the folded-column cap", () => {
	const out = foldedCommand("bash", { command: "x".repeat(200) });
	assert.equal(out.length, 60);
	assert.ok(out.endsWith("…"));
});

test("foldedCommand truncates long paths too", () => {
	const out = foldedCommand("read", { path: "a/".repeat(60) + "file.go" });
	assert.equal(out.length, 60);
	assert.ok(out.endsWith("…"));
});

test("editCounts ignores +++/--- headers", () => {
	const diff = ["--- a/f", "+++ b/f", "+added one", "+added two", "-removed", " ctx"].join("\n");
	assert.deepEqual(editCounts(diff), { add: 2, rem: 1 });
});

test("editCounts handles missing diff", () => {
	assert.deepEqual(editCounts(undefined), { add: 0, rem: 0 });
});

test("foldSummary: edit yields diff counts", () => {
	const diff = ["+a", "+b", "+c", "+d", "+e", "+f", "+g", "+h", "-x", "-y"].join("\n");
	const s = foldSummary("edit", { details: { diff } }, false);
	assert.equal(s.tone, "edit");
	assert.equal(s.add, 8);
	assert.equal(s.rem, 2);
});

test("foldSummary: bash success is bare", () => {
	const s = foldSummary("bash", { content: [{ type: "text", text: "on main\nclean" }] }, false);
	assert.equal(s.tone, "");
	assert.equal(s.text, "");
});

test("foldSummary: bash error shows exit code", () => {
	const s = foldSummary("bash", { content: [{ type: "text", text: "Command exited with code 2" }] }, true);
	assert.equal(s.tone, "error");
	assert.equal(s.text, "✗ exit 2");
});

test("foldSummary: read error is truncated first line", () => {
	const s = foldSummary("read", { content: [{ type: "text", text: "no such file: /x\nmore" }] }, true);
	assert.equal(s.tone, "error");
	assert.ok(s.text.startsWith("✗ no such file"));
});

test("resultText joins only text parts", () => {
	const r = { content: [{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }] };
	assert.equal(resultText(r), "a\nb");
	assert.equal(lineCount(resultText(r)), 2);
});
