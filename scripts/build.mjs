// Build every TypeScript pi extension in the repo into PACKAGE/dist/.
//
// Discovers immediate child package.json files, reads each `pi.extensions`,
// and bundles every entry with esbuild. Each entry names its compiled output
// under dist/; the matching source is the same basename under extensions/.
// Deps stay external; pi resolves them at load time. Packages without
// extension entries are skipped.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const manifests = readdirSync(root, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => join(root, d.name, "package.json"));

let built = 0;
for (const file of manifests) {
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		continue; // no package.json here
	}
	const entries = manifest.pi?.extensions ?? [];
	if (entries.length === 0) continue;
	const dir = dirname(file);
	for (const entry of entries) {
		const outfile = join(dir, entry);
		const stem = basename(entry).replace(/\.(ts|js)$/, "");
		const source = join(dir, "extensions", `${stem}.ts`);
		if (!existsSync(source)) {
			console.error(`${basename(dir)}: no source extensions/${stem}.ts for ${entry}`);
			process.exit(1);
		}
		await build({
			entryPoints: [source],
			outfile,
			bundle: true,
			platform: "node",
			format: "esm",
			target: "node22",
			packages: "external",
		});
		console.log(`==> ${basename(dir)}/${entry.replace(/^\.\//, "")}`);
		built++;
	}
}
console.log(`== built ${built} extension(s)`);
