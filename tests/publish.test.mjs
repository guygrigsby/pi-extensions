import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Exercise the real recipe; replace only npm's external registry operations.
function publish(t, failure, packages = "active-model aperture-models") {
	const dir = mkdtempSync(join(tmpdir(), "pi-publish-test-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	copyFileSync(new URL("../Makefile", import.meta.url), join(dir, "Makefile"));
	writeFileSync(join(dir, "skip.mk"), "build bump:\n\t@true\n");
	for (const name of ["active-model", "aperture-models"]) {
		mkdirSync(join(dir, name));
		writeFileSync(join(dir, name, "package.json"), JSON.stringify({
			name: `@guygrigsby/pi-${name}`, version: "0.1.0",
		}));
	}
	writeFileSync(join(dir, "npm.mjs"), `
import { appendFileSync } from 'node:fs';
import { basename, join } from 'node:path';
const command = process.argv[2];
const name = basename(process.cwd());
if (command === 'view') process.exit(process.env.PUBLISHED === 'yes' ? 0 : 1);
if (command !== 'publish') process.exit(2);
appendFileSync(join(process.env.FIXTURE, 'attempts'), name + '\\n');
if (name === 'active-model' && process.env.FAILURE) {
  console.error(process.env.FAILURE);
  process.exit(1);
}
`);
	const result = spawnSync("make", ["--no-print-directory", "-f", "Makefile", "-f", "skip.mk",
		"publish", `PKGS=${packages}`, `NPM=${process.execPath} ${join(dir, "npm.mjs")}`], {
		cwd: dir, encoding: "utf8",
		env: { ...process.env, FIXTURE: dir, FAILURE: failure, PUBLISHED: failure === "published" ? "yes" : "no" },
	});
	let attempts = "";
	try { attempts = readFileSync(join(dir, "attempts"), "utf8"); } catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	return { ...result, attempts };
}

for (const failure of [
	'npm error E409 Cannot publish over previously staged version "0.1.0".',
	"npm error E403 Forbidden",
]) {
	test(`publish reaches later packages after ${failure}`, (t) => {
		const result = publish(t, failure);
		assert.equal(result.attempts, "active-model\naperture-models\n");
		assert.notEqual(result.status, 0);
		assert.ok(result.stderr.includes(failure));
	});
}

test("publish succeeds when every package succeeds", (t) => {
	const result = publish(t, "");
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.attempts, "active-model\naperture-models\n");
});

test("publish skips versions already on the registry", (t) => {
	const result = publish(t, "published");
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.attempts, "");
});

test("PKGS scopes publishing to aperture-models", (t) => {
	const result = publish(t, "", "aperture-models");
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.attempts, "aperture-models\n");
});
