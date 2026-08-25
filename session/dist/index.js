// session/extensions/index.ts
import { VERSION } from "@earendil-works/pi-coding-agent";

// session/extensions/session-core.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
function parseOsRelease(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = /^([A-Z_]+)=(?:"([^"]*)"|(.*))$/.exec(line.trim());
    if (m) out[m[1]] = m[2] ?? m[3];
  }
  return out;
}
function linuxDistro(path = "/etc/os-release") {
  try {
    const fields = parseOsRelease(readFileSync(path, "utf8"));
    return fields.PRETTY_NAME ?? "";
  } catch {
    return "";
  }
}
function macDistro() {
  try {
    const out = execFileSync("sw_vers", [], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const name = /^ProductName:\s*(.+)$/m.exec(out)?.[1] ?? "";
    const version = /^ProductVersion:\s*(.+)$/m.exec(out)?.[1] ?? "";
    return [name, version].filter(Boolean).join(" ");
  } catch {
    return "";
  }
}
function distroLabel(platform = process.platform) {
  if (platform === "linux") return linuxDistro();
  if (platform === "darwin") return macDistro();
  return "";
}
function buildUserAgent(version, { platform, release, arch, distro } = {}) {
  const parts = [`${platform} ${release}`, arch];
  if (distro) parts.push(distro);
  return `pi/${version} (${parts.join("; ")})`;
}
function defaultUserAgent(version) {
  return buildUserAgent(version, {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    distro: distroLabel()
  });
}

// session/extensions/index.ts
var UA = defaultUserAgent(VERSION);
function session(pi) {
  pi.on("before_provider_headers", (event, ctx) => {
    event.headers["X-Pi-Session-Id"] = ctx.sessionManager.getSessionId();
    event.headers["User-Agent"] = UA;
  });
}
export {
  session as default
};
