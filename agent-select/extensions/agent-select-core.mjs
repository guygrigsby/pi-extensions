// agent-select-core - pi registry to agent-select candidates, and the CLI
// calls. No pi imports, so it tests in plain node. Ranking policy is
// agent-select's; this file only asserts what the registry says.

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Chat models only: those are what a subagent spawn can run. Caps are the
// registry's input modalities plus "reasoning". Rates are USD per million.
// The registry reports 0 for subscription and unpriced models, so a zero
// rate is unknown unless the provider is declared free (local inference).
export function toCandidates(models, { freeProviders = [] } = {}) {
	const free = new Set(freeProviders);
	return models
		.filter((m) => (m.type ?? "chat") === "chat")
		.map((m) => {
			const caps = [...(m.input ?? [])];
			if (m.reasoning) caps.push("reasoning");
			const c = { id: `${m.provider}/${m.id}`, caps: caps.sort() };
			if (m.contextWindow > 0) c.context_tokens = m.contextWindow;
			if (m.maxTokens > 0) c.max_output_tokens = m.maxTokens;
			const isFree = free.has(m.provider);
			for (const [from, to] of [["input", "input_usd_per_mtok"], ["output", "output_usd_per_mtok"]]) {
				const v = m.cost?.[from];
				if (isFree) c[to] = 0;
				else if (typeof v === "number" && v > 0) c[to] = v;
			}
			return c;
		})
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function buildRequest(params, candidates, scores) {
	const task = {
		name: params.task,
		mode: params.mode ?? "cost",
		need: params.need ?? [],
		input_tokens: params.input_tokens ?? 0,
		output_tokens: params.output_tokens ?? 0,
		allow_unscored: true,
	};
	if (params.max_cost_usd !== undefined) task.max_cost_usd = params.max_cost_usd;
	return { task, candidates, scores };
}

// jevUrl, when set, points the CLI's Jev calls at a gateway; otherwise the
// CLI reads TYPESAFE_URL or TYPESAFE_API_KEY from pi's environment.
function exec(cli, args, input, signal, jevUrl) {
	return new Promise((resolve, reject) => {
		const env = jevUrl ? { ...process.env, TYPESAFE_URL: jevUrl } : process.env;
		const child = spawn(cli, args, { signal, env, stdio: ["pipe", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => (stdout += d));
		child.stderr.on("data", (d) => (stderr += d));
		child.on("error", reject);
		child.on("close", (code) => resolve({ code, stdout, stderr: stderr.trim() }));
		child.stdin.end(input);
	});
}

// rank exits 0 with a pick and 3 with none; both carry the full result.
export async function rank({ cli, history, minRuns, request, signal }) {
	const args = ["rank"];
	if (history) args.push("--history", history);
	if (minRuns) args.push("--min-runs", String(minRuns));
	const { code, stdout, stderr } = await exec(cli, args, JSON.stringify(request), signal);
	if (code !== 0 && code !== 3) throw new Error(`agent-select rank exit ${code}${stderr ? `: ${stderr}` : ""}`);
	const res = JSON.parse(stdout);
	if (stderr) res.warnings = stderr.split("\n");
	return res;
}

export async function record({ cli, history, task, model, verdict, signal }) {
	if (verdict !== "pass" && verdict !== "fail") throw new Error(`verdict must be pass or fail, got ${verdict}`);
	const args = ["record", "--history", history, "--task", task, "--id", model, "--verdict", verdict];
	const { code, stderr } = await exec(cli, args, "", signal);
	if (code !== 0) throw new Error(`agent-select record exit ${code}${stderr ? `: ${stderr}` : ""}`);
}

// The task kinds route_subagent knows and the registry capabilities Jev
// may require, each with what it means. Config "taxonomy" replaces it.
export const DEFAULT_TAXONOMY = {
	tasks: {
		code: "write, fix or change source code",
		review: "review a code change or design and comment on it",
		research: "find, read and summarize information",
		docs: "write prose documentation",
	},
	caps: {
		image: "reading images or screenshots",
		reasoning: "hard multi-step problem solving: debugging an unknown failure, design, proofs; not routine edits",
	},
};

// classify asks agent-select's Jev classifier for the task fields of a
// prompt: name ("" when it fits none or Jev is unsure), need and sizes.
export async function classify({ cli, jevUrl, taxonomy = DEFAULT_TAXONOMY, prompt, signal }) {
	const dir = await mkdtemp(join(tmpdir(), "agent-select-"));
	try {
		const path = join(dir, "taxonomy.json");
		await writeFile(path, JSON.stringify(taxonomy));
		const { code, stdout, stderr } = await exec(cli, ["classify", "--taxonomy", path], prompt, signal, jevUrl);
		if (code !== 0) throw new Error(`agent-select classify exit ${code}${stderr ? `: ${stderr}` : ""}`);
		const { name = "", need = null, input_tokens, output_tokens } = JSON.parse(stdout).task;
		return { name, need, input_tokens, output_tokens };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

// mergeClassified fills the route parameters the caller left out from a
// classification; anything the caller set wins.
export function mergeClassified(params, c) {
	const out = { ...params };
	if (out.task === undefined && c.name) out.task = c.name;
	if (out.need === undefined && c.need) out.need = c.need;
	for (const k of ["input_tokens", "output_tokens"]) if (out[k] === undefined && c[k] > 0) out[k] = c[k];
	return out;
}

// judge asks Jev whether a run did what was asked. agent-select appends the
// verdict only when Jev is sure (exit 0); exit 3 is undecided, nothing recorded.
export async function judge({ cli, jevUrl, history, task, model, request, result, signal }) {
	const args = ["judge", "--history", history, "--task", task, "--id", model];
	const { code, stdout, stderr } = await exec(cli, args, JSON.stringify({ request, result }), signal, jevUrl);
	if (code !== 0 && code !== 3) throw new Error(`agent-select judge exit ${code}${stderr ? `: ${stderr}` : ""}`);
	return JSON.parse(stdout);
}

const ALTERNATIVES = 3;

export function summarize(res) {
	const line = (r) => {
		const score = r.score ? `score ${r.score.Value.toFixed(2)} (${r.score.Basis})` : "unscored";
		const cost = r.cost_usd !== undefined ? `$${r.cost_usd.toFixed(4)}` : "cost unknown";
		const warn = r.warnings?.length ? ` [${r.warnings.join(", ")}]` : "";
		return `${r.id}  ${score}, ${cost}${warn}`;
	};
	const [best, ...rest] = res.ranked ?? [];
	const out = best ? [`model: ${best.id}`, `  ${line(best)}`] : ["no candidate fits the task"];
	if (rest.length) out.push("alternatives:", ...rest.slice(0, ALTERNATIVES).map((r) => `  ${line(r)}`));
	if (res.rejected?.length) out.push("rejected:", ...res.rejected.map((r) => `  ${r.ID}: ${r.Reasons.join(", ")}`));
	if (res.warnings?.length) out.push(...res.warnings.map((w) => `warning: ${w}`));
	return out.join("\n");
}
