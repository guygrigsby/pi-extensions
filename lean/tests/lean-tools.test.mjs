import { test } from "node:test";
import assert from "node:assert/strict";
import {
	padTool,
	toolTarget,
	editCounts,
	foldSummary,
	quietLabel,
	resultText,
	lineCount,
} from "../extensions/lean-tools-core.mjs";

test("quietLabel: past-tense summary, no command echo, basenames only", () => {
	assert.equal(quietLabel("bash", { command: "git status && rm -rf x" }), "Ran shell command");
	assert.equal(quietLabel("read", { path: "src/compiler.go" }), "Read compiler.go");
	assert.equal(quietLabel("edit", { path: "a/b/parser.go" }), "Edited parser.go");
	assert.equal(quietLabel("write", { path: "out.txt" }), "Wrote out.txt");
	assert.equal(quietLabel("grep", { pattern: "SemanticEdit" }), 'Searched "SemanticEdit"');
	assert.equal(quietLabel("ls", { path: "/tmp/dir/" }), "Listed dir");
	assert.equal(quietLabel("ls", {}), "Listed directory");
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
