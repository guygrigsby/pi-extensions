import assert from "node:assert/strict";
import { test } from "node:test";
import { buildUserAgent, linuxDistro, parseOsRelease } from "../extensions/session-core.mjs";

test("parseOsRelease parses quoted and bare values", () => {
	const fields = parseOsRelease(
		'PRETTY_NAME="Ubuntu 24.04.3 LTS"\nNAME=Ubuntu\nVERSION_ID="24.04"\n# comment\n\n',
	);
	assert.equal(fields.PRETTY_NAME, "Ubuntu 24.04.3 LTS");
	assert.equal(fields.NAME, "Ubuntu");
	assert.equal(fields.VERSION_ID, "24.04");
});

test("linuxDistro reads PRETTY_NAME and tolerates a missing file", () => {
	assert.equal(linuxDistro("/nonexistent/os-release"), "");
});

test("buildUserAgent includes version, kernel, arch and distro", () => {
	const ua = buildUserAgent("0.83.0", {
		platform: "linux",
		release: "6.8.0-79-generic",
		arch: "x64",
		distro: "Ubuntu 24.04.3 LTS",
	});
	assert.equal(ua, "pi/0.83.0 (linux 6.8.0-79-generic; x64; Ubuntu 24.04.3 LTS)");
	// aperture normalizes agents by UA prefix; pi/ must survive.
	assert.ok(ua.startsWith("pi/"));
});

test("buildUserAgent omits the distro segment when unknown", () => {
	const ua = buildUserAgent("0.83.0", {
		platform: "darwin",
		release: "24.0.0",
		arch: "arm64",
		distro: "",
	});
	assert.equal(ua, "pi/0.83.0 (darwin 24.0.0; arm64)");
});
