import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

// The README package table is the catalog people read to find a package. It
// drifted once already (a deleted package kept its row), so hold both
// directions: every package is listed, and every listed row points somewhere.
const root = new URL("..", import.meta.url);
const readme = readFileSync(new URL("README.md", root), "utf8");

function packageDirs() {
	return readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((name) => name !== "node_modules" && existsSync(new URL(`${name}/package.json`, root)))
		.sort();
}

test("every package has a README table row", () => {
	const missing = packageDirs().filter((name) => !readme.includes(`(${name}/)`));
	assert.deepEqual(missing, []);
});

test("every README table row points at a real package", () => {
	const rows = [...readme.matchAll(/^\|\s*\[`([^`/]+)\/`\]\(/gm)].map((match) => match[1]).sort();
	assert.deepEqual(rows, packageDirs());
});
