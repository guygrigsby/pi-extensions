/**
 * session-core — pure helpers for the session extension: build the enriched
 * pi User-Agent and find the machine's distro label. No pi imports, so the
 * tests exercise this file directly.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";

/** Parse KEY=value lines from /etc/os-release content. Values may be quoted. */
export function parseOsRelease(text) {
	const out = {};
	for (const line of text.split("\n")) {
		const m = /^([A-Z_]+)=(?:"([^"]*)"|(.*))$/.exec(line.trim());
		if (m) out[m[1]] = m[2] ?? m[3];
	}
	return out;
}

/** Linux distro label, e.g. "Ubuntu 24.04.3 LTS". "" when unreadable. */
export function linuxDistro(path = "/etc/os-release") {
	try {
		const fields = parseOsRelease(readFileSync(path, "utf8"));
		return fields.PRETTY_NAME ?? "";
	} catch {
		return "";
	}
}

/** macOS product label, e.g. "macOS 15.1". "" when sw_vers fails. */
export function macDistro() {
	try {
		const out = execFileSync("sw_vers", [], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		const name = /^ProductName:\s*(.+)$/m.exec(out)?.[1] ?? "";
		const version = /^ProductVersion:\s*(.+)$/m.exec(out)?.[1] ?? "";
		return [name, version].filter(Boolean).join(" ");
	} catch {
		return "";
	}
}

/** Best-effort OS product/distro label for this machine. "" on other platforms. */
export function distroLabel(platform = process.platform) {
	if (platform === "linux") return linuxDistro();
	if (platform === "darwin") return macDistro();
	return "";
}

/**
 * pi's LLM User-Agent is `pi (linux 6.8.0; x64)`: platform and kernel, no pi
 * version, no distro. This builds the enriched form aperture reads:
 *
 *   pi/0.83.0 (linux 6.8.0-79-generic; x64; Ubuntu 24.04.3 LTS)
 *
 * Keeps the `pi/` prefix so aperture's agent normalization still buckets it
 * as Pi.
 */
export function buildUserAgent(version, { platform, release, arch, distro } = {}) {
	const parts = [`${platform} ${release}`, arch];
	if (distro) parts.push(distro);
	return `pi/${version} (${parts.join("; ")})`;
}

/** The UA this process sends, resolved once at load. */
export function defaultUserAgent(version) {
	return buildUserAgent(version, {
		platform: os.platform(),
		release: os.release(),
		arch: os.arch(),
		distro: distroLabel(),
	});
}
