import { test } from "node:test";
import assert from "node:assert/strict";
import { slugForCwd, projectMemoryDir } from "../extensions/claude-memory-core.mjs";

test("slugForCwd replaces every slash with a dash", () => {
  assert.equal(slugForCwd("/Users/guygrigsby/projects/pi-extensions"), "-Users-guygrigsby-projects-pi-extensions");
});

test("projectMemoryDir builds the Claude Code project memory path", () => {
  assert.equal(
    projectMemoryDir("/Users/guygrigsby/projects/pi-extensions", "/Users/guygrigsby"),
    "/Users/guygrigsby/.claude/projects/-Users-guygrigsby-projects-pi-extensions/memory",
  );
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readMemoryFiles, assembleMemoryBlock } from "../extensions/claude-memory-core.mjs";

test("assembleMemoryBlock returns empty string when nothing to inject", () => {
  assert.equal(assembleMemoryBlock([]), "");
  assert.equal(assembleMemoryBlock([{ name: "MEMORY.md", content: "" }]), "");
});

test("assembleMemoryBlock wraps content in a guarded read-only block", () => {
  const block = assembleMemoryBlock([
    { name: "MEMORY.md", content: "- [X](x.md)" },
    { name: "x.md", content: "fact body" },
  ]);
  assert.match(block, /<memory-context source="claude-code" readonly="true">/);
  assert.match(block, /not instructions/i);
  assert.match(block, /## MEMORY\.md\n- \[X\]\(x\.md\)/);
  assert.match(block, /## x\.md\nfact body/);
  assert.match(block, /<\/memory-context>$/);
});

test("readMemoryFiles returns MEMORY.md first and skips a missing dir", () => {
  assert.deepEqual(readMemoryFiles("/no/such/dir/nowhere"), []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccmem-"));
  fs.writeFileSync(path.join(dir, "alpha.md"), "A");
  fs.writeFileSync(path.join(dir, "MEMORY.md"), "index");
  fs.writeFileSync(path.join(dir, "notes.txt"), "ignored");
  const files = readMemoryFiles(dir);
  assert.deepEqual(files.map((f) => f.name), ["MEMORY.md", "alpha.md"]);
  assert.equal(files[0].content, "index");
});
