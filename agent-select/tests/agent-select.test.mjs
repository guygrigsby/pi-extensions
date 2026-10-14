import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRequest, classify, judge, mergeClassified, rank, record, summarize, toCandidates } from "../extensions/agent-select-core.mjs";

const models = [
	{ provider: "anthropic", id: "sonnet", input: ["text", "image"], reasoning: true, contextWindow: 1_000_000, maxTokens: 64_000, cost: { input: 3, output: 15 } },
	{ provider: "kimi-coding", id: "kimi", input: ["text"], reasoning: false, contextWindow: 262_144, maxTokens: 32_768, cost: { input: 0, output: 0 } },
	{ provider: "mlx", id: "coder", input: ["text"], reasoning: false, contextWindow: 32_768, maxTokens: 8_192, cost: { input: 0, output: 0 } },
	{ provider: "openai", id: "gpt-image", type: "image", input: ["text"], cost: { input: 5, output: 40 } },
];

test("toCandidates projects chat models and treats unpriced zeros as unknown", () => {
	const cands = toCandidates(models, { freeProviders: ["mlx"] });
	assert.deepEqual(cands.map((c) => c.id), ["anthropic/sonnet", "kimi-coding/kimi", "mlx/coder"]);
	const [sonnet, kimi, local] = cands;
	assert.deepEqual(sonnet.caps, ["image", "reasoning", "text"]);
	assert.equal(sonnet.input_usd_per_mtok, 3);
	assert.equal(sonnet.context_tokens, 1_000_000);
	// A subscription model reports 0: that is no price, not free.
	assert.equal(kimi.input_usd_per_mtok, undefined);
	assert.equal(kimi.output_usd_per_mtok, undefined);
	// A declared free provider is free.
	assert.equal(local.input_usd_per_mtok, 0);
	assert.equal(local.output_usd_per_mtok, 0);
});

test("buildRequest admits unscored candidates and passes only set bounds", () => {
	const req = buildRequest({ task: "code", input_tokens: 10 }, [], { "*": { code: 0.5 } });
	assert.deepEqual(req.task, { name: "code", mode: "cost", need: [], input_tokens: 10, output_tokens: 0, allow_unscored: true });
	assert.deepEqual(req.scores, { "*": { code: 0.5 } });
	const bounded = buildRequest({ task: "code", mode: "quality", need: ["image"], max_cost_usd: 0.25 }, [], {});
	assert.equal(bounded.task.max_cost_usd, 0.25);
	assert.equal(bounded.task.mode, "quality");
});

test("summarize names the pick, alternatives and rejections", () => {
	const text = summarize({
		ranked: [
			{ id: "a/x", score: { Value: 0.8, Basis: "history n=6" }, cost_usd: 0.012, warnings: [] },
			{ id: "b/y", warnings: ["unscored", "cost_unknown"] },
		],
		rejected: [{ ID: "c/z", Reasons: ["context"] }],
	});
	assert.match(text, /model: a\/x/);
	assert.match(text, /score 0\.80 \(history n=6\)/);
	assert.match(text, /\$0\.0120/);
	assert.match(text, /b\/y .*unscored/);
	assert.match(text, /c\/z: context/);
	assert.match(summarize({ ranked: [], rejected: [] }), /no candidate/);
});

// Drives the real agent-select CLI: record outcomes, then rank on them.
const cli = process.env.AGENT_SELECT_CLI ?? "agent-select";
let haveCli = true;
try {
	execFileSync(cli, ["record"], { stdio: "ignore" });
} catch (err) {
	haveCli = err.status === 2; // usage error means the binary ran
}

test("record then rank through the real CLI", { skip: !haveCli && `${cli} not on PATH` }, async () => {
	const history = join(await mkdtemp(join(tmpdir(), "agent-select-")), "outcomes.jsonl");
	for (let i = 0; i < 5; i++) {
		await record({ cli, history, task: "code", model: "kimi-coding/kimi", verdict: "pass" });
		await record({ cli, history, task: "code", model: "anthropic/sonnet", verdict: "fail" });
	}
	assert.equal((await readFile(history, "utf8")).trim().split("\n").length, 10);
	await assert.rejects(record({ cli, history, task: "code", model: "x", verdict: "maybe" }), /verdict/);

	const request = buildRequest({ task: "code", mode: "quality" }, toCandidates(models, { freeProviders: ["mlx"] }), {
		"anthropic/sonnet": { code: 0.9 },
	});
	const res = await rank({ cli, history, minRuns: 5, request });
	assert.equal(res.ranked[0].id, "kimi-coding/kimi");
	assert.match(res.ranked[0].score.Basis, /history n=5/);

	const none = await rank({ cli, history, request: buildRequest({ task: "code", need: ["video"] }, request.candidates, {}) });
	assert.equal(none.ranked.length, 0);
	assert.ok(none.rejected.length > 0);
});

test("mergeClassified fills only what the caller left out", () => {
	const c = { name: "code", need: ["reasoning"], input_tokens: 900, output_tokens: 8000 };
	assert.deepEqual(mergeClassified({ mode: "quality" }, c), { mode: "quality", task: "code", need: ["reasoning"], input_tokens: 900, output_tokens: 8000 });
	assert.deepEqual(mergeClassified({ task: "review", need: [], output_tokens: 10 }, c), { task: "review", need: [], input_tokens: 900, output_tokens: 10 });
	// An unclassified prompt leaves the task unknown, never a guess.
	assert.equal(mergeClassified({}, { name: "", need: null, input_tokens: 3, output_tokens: 500 }).task, undefined);
});

// A stand-in for Jev's /v1/systemone that answers from the question ids.
async function fakeJev(t, noul) {
	const srv = createServer((req, res) => {
		let body = "";
		req.on("data", (d) => (body += d));
		req.on("end", () => {
			const answers = {};
			for (const [id, q] of Object.entries(JSON.parse(body).questions)) {
				if (q.type === "choice") answers[id] = { type: "choice", choice: "code", confidence: 0.9, probabilities: { code: 0.9 } };
				else if (q.type === "score") answers[id] = { type: "score", score: 2, confidence: 1, probabilities: { 2: 1 } };
				else answers[id] = { type: "noul", noul: id === "need:image" ? 0.1 : noul };
			}
			res.end(JSON.stringify({ model: "jev-test", answers }));
		});
	});
	await new Promise((r) => srv.listen(0, "127.0.0.1", r));
	t.after(() => srv.close());
	return `http://127.0.0.1:${srv.address().port}/v1/systemone`;
}

test("classify through the real CLI", { skip: !haveCli && `${cli} not on PATH` }, async (t) => {
	const jevUrl = await fakeJev(t, 0.9);
	const c = await classify({ cli, jevUrl, prompt: "fix the flaky test" });
	assert.deepEqual(c, { name: "code", need: ["reasoning"], input_tokens: 5, output_tokens: 8000 });
});

test("judge through the real CLI records only a decided verdict", { skip: !haveCli && `${cli} not on PATH` }, async (t) => {
	const history = join(await mkdtemp(join(tmpdir(), "agent-select-")), "outcomes.jsonl");
	const run = { cli, history, task: "code", model: "a/x", request: "add a test", result: "--- PASS: TestX" };
	const v = await judge({ ...run, jevUrl: await fakeJev(t, 0.95) });
	assert.equal(v.decided, true);
	assert.equal(v.pass, true);
	const unsure = await judge({ ...run, jevUrl: await fakeJev(t, 0.5) });
	assert.equal(unsure.decided, false);
	assert.equal(await readFile(history, "utf8"), '{"task":"code","id":"a/x","pass":true,"judge":"jev-test"}\n');
});
