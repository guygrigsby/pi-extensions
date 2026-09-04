// Verify every pi extension manifest entry points at an existing .js file,
// so a stale or missing build can never ship. Exits non-zero on any
// violation.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const manifests = readdirSync(root, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => join(root, d.name, "package.json"));

let bad = 0;
for (const file of manifests) {
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		continue; // no package.json here
	}
	const dir = dirname(file);
	for (const entry of manifest.pi?.extensions ?? []) {
		const target = join(dir, entry);
		if (!entry.endsWith(".js")) {
			console.error(`${basename(dir)}: ${entry} is not a .js file`);
			bad++;
		} else if (!existsSync(target)) {
			console.error(`${basename(dir)}: ${entry} missing; run \`make build\``);
			bad++;
		}
	}
}
if (bad > 0) {
	console.error(`== ${bad} manifest entr${bad === 1 ? "y" : "ies"} bad`);
	process.exit(1);
}
console.log("== all extension manifests point at existing .js files");
