// agent-select-core - pi registry to agent-select candidates, and the CLI
// calls. No pi imports, so it tests in plain node. Ranking policy is
// agent-select's; this file only asserts what the registry says.

import { spawn } from "node:child_process";

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

function exec(cli, args, input, signal) {
	return new Promise((resolve, reject) => {
		const child = spawn(cli, args, { signal, stdio: ["pipe", "pipe", "pipe"] });
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
