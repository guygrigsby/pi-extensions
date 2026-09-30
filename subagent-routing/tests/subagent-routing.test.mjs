import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MODES,
  TIERS,
  assignTiers,
  buildPolicy,
  costScore,
  applyPricing,
} from "../extensions/subagent-routing-core.mjs";
import {
  distillModelsDev,
  distillVercel,
  fetchPricing,
  normalizeModelId,
  pricingStale,
} from "../extensions/pricing.mjs";
import { evaluate } from "../extensions/jev.mjs";

const models = [
  { provider: "mlx", id: "coder", cost: { input: 0, output: 0 } },
  { provider: "kimi-coding", id: "kimi-for-coding", cost: { input: 0, output: 0 } },
  { provider: "deepseek", id: "deepseek-v4-flash", cost: { input: 0.1, output: 0.2 } },
  { provider: "deepseek", id: "deepseek-v4-pro", cost: { input: 0.5, output: 1 } },
  { provider: "moonshotai", id: "kimi-k3", cost: { input: 1, output: 2 } },
  { provider: "anthropic", id: "claude-sonnet-5", cost: { input: 3, output: 15 } },
  { provider: "anthropic", id: "claude-opus-4-8", cost: { input: 5, output: 25 } },
];

test("costScore blends input and output, tolerates missing cost", () => {
  assert.equal(costScore({ cost: { input: 1, output: 2 } }), 3);
  assert.equal(costScore({}), 0);
});

test("MODES and TIERS are the advertised sets", () => {
  assert.deepEqual(MODES, ["cost", "performance"]);
  assert.deepEqual(TIERS, ["cheap", "mid", "frontier"]);
});

test("assignTiers excludes local models and the orchestrator's own model", () => {
  const tiers = assignTiers(models, { selfId: "anthropic/claude-opus-4-8" });
  const all = [...tiers.cheap, ...tiers.mid, ...tiers.frontier];
  assert.ok(!all.some((m) => m.provider === "mlx"));
  assert.ok(!all.some((m) => m.id === "claude-opus-4-8"));
  assert.equal(all.length, 5);
});

test("assignTiers splits the price-sorted pool into terciles, all models placed", () => {
  const tiers = assignTiers(models, {});
  assert.deepEqual(tiers.cheap.map((m) => m.id), ["kimi-for-coding", "deepseek-v4-flash"]);
  assert.deepEqual(tiers.mid.map((m) => m.id), ["deepseek-v4-pro", "kimi-k3"]);
  assert.deepEqual(tiers.frontier.map((m) => m.id), ["claude-sonnet-5", "claude-opus-4-8"]);
});

test("assignTiers dedupes identical model ids across providers, cheapest provider wins", () => {
  const dup = [
    { provider: "openrouter", id: "kimi-k3", cost: { input: 2, output: 4 } },
    ...models,
  ];
  const tiers = assignTiers(dup, {});
  const k3 = [...tiers.cheap, ...tiers.mid, ...tiers.frontier].filter((m) => m.id === "kimi-k3");
  assert.equal(k3.length, 1);
  assert.equal(k3[0].provider, "moonshotai");
});

test("overrides pin a model to a tier, exact key beats glob, unknown tiers ignored", () => {
  const tiers = assignTiers(models, {
    overrides: {
      "kimi-coding/*": "frontier",
      "deepseek/deepseek-v4-flash": "mid",
      "deepseek/*": "cheap",
      "moonshotai/kimi-k3": "hyperspeed",
    },
  });
  assert.ok(tiers.frontier.some((m) => m.id === "kimi-for-coding"));
  assert.ok(tiers.mid.some((m) => m.id === "deepseek-v4-flash"));
  assert.ok(tiers.cheap.some((m) => m.id === "deepseek-v4-pro"));
  assert.ok(tiers.mid.some((m) => m.id === "kimi-k3"));
});

test("assignTiers degrades gracefully on tiny pools", () => {
  const one = assignTiers([models[1]], {});
  assert.equal(one.cheap.length, 1);
  const none = assignTiers([], {});
  assert.deepEqual(none, { cheap: [], mid: [], frontier: [] });
});

test("policy lists every tier grouped by provider with prices", () => {
  const p = buildPolicy(models, { mode: "cost", selfId: "anthropic/claude-opus-4-8" });
  assert.match(p, /### cheap/);
  assert.match(p, /### mid/);
  assert.match(p, /### frontier/);
  assert.match(p, /- deepseek: deepseek-v4-flash \(\$0\.1\/\$0\.2\)/);
  assert.match(p, /- kimi-coding: kimi-for-coding \(\$0\/\$0\)/);
  assert.doesNotMatch(p, /mlx: coder/);
  assert.doesNotMatch(p, /claude-opus-4-8/);
});

test("same-provider models in one tier share a comma-separated line", () => {
  const p = buildPolicy(models, {
    mode: "cost",
    overrides: { "deepseek/*": "mid" },
    selfId: "anthropic/claude-opus-4-8",
  });
  assert.match(p, /- deepseek: deepseek-v4-flash \(\$0\.1\/\$0\.2\), deepseek-v4-pro \(\$0\.5\/\$1\)/);
});

test("cost mode instructs cheapest-adequate with escalation on failed review", () => {
  const p = buildPolicy(models, { mode: "cost" });
  assert.match(p, /mode: cost/);
  assert.match(p, /cheapest tier plausibly adequate/);
  assert.match(p, /Escalate one tier when a review fails/);
});

test("performance mode instructs first-try success without defaulting to frontier", () => {
  const p = buildPolicy(models, { mode: "performance" });
  assert.match(p, /mode: performance/);
  assert.match(p, /passes review first try/);
  assert.match(p, /mechanical work still goes cheap/i);
});

test("policy keeps the review gate, parallel fan-out, and own-model top rung", () => {
  const p = buildPolicy(models, { mode: "cost" });
  assert.match(p, /reviewer/);
  assert.match(p, /run_in_background: true/);
  assert.match(p, /WITHOUT a `model` override/);
  assert.match(p, /\/subagent-routing cost\|performance/);
  assert.match(p, /trust your own knowledge/);
});

test("policy caps turns, reviews the diff on mid, and stops after two failures", () => {
  const p = buildPolicy(models, { mode: "cost" });
  assert.match(p, /maxTurns/);
  assert.match(p, /Hand the reviewer the diff itself/);
  assert.match(p, /Route the reviewer to mid for mechanical tasks/);
  assert.match(p, /re-spawn higher with the review findings included/);
  assert.match(p, /Never a blind retry/);
  assert.match(p, /Stop after two failed reviews/);
});

test("judge mode swaps review steps but keeps the fallback and the findings feed", () => {
  const p = buildPolicy(models, { mode: "cost", judge: true });
  assert.match(p, /call the `judge` tool/);
  assert.match(p, /re-spawn higher with the findings included/);
  assert.match(p, /Never a blind retry/);
  assert.match(p, /reviewer subagent/);
  assert.doesNotMatch(p, /Hand the reviewer the diff itself/);
});

test("policy says do it yourself when nothing else is configured", () => {
  const p = buildPolicy([{ provider: "moonshotai", id: "kimi-k3" }], { selfId: "moonshotai/kimi-k3" });
  assert.match(p, /do all work yourself/);
});

// --- pricing fallback ---

test("normalizeModelId keys on the model tail, ignoring case and separators", () => {
  assert.equal(normalizeModelId("anthropic/claude-haiku-4.5"), "claudehaiku45");
  assert.equal(normalizeModelId("claude_haiku_4_5"), "claudehaiku45");
  assert.equal(normalizeModelId(undefined), "");
});

test("distillModelsDev keeps numeric per-Mtok prices, cheapest wins collisions", () => {
  const prices = distillModelsDev({
    anthropic: { models: { "claude-haiku-4.5": { cost: { input: 1, output: 5 } } } },
    openrouter: {
      models: {
        "claude-haiku-4.5": { cost: { input: 0.5, output: 2 } },
        "free-model": { cost: {} },
      },
    },
  });
  assert.deepEqual(prices, { claudehaiku45: { input: 0.5, output: 2 } });
});

test("distillVercel converts string per-token prices to per-Mtok", () => {
  const prices = distillVercel({
    data: [
      { id: "moonshotai/kimi-k3", pricing: { input: "0.000001", output: "0.000002" } },
      { id: "broken", pricing: { input: "nope" } },
    ],
  });
  assert.deepEqual(prices, { kimik3: { input: 1, output: 2 } });
});

test("fetchPricing prefers models.dev, falls back to vercel, throws when both fail", async () => {
  const ok = (body) => async () => ({ ok: true, json: async () => body });
  const modelsDev = { anthropic: { models: { "claude-sonnet-5": { cost: { input: 3, output: 15 } } } } };
  const vercel = { data: [{ id: "claude-sonnet-5", pricing: { input: "0.000003", output: "0.000015" } }] };
  assert.equal((await fetchPricing({ fetchImpl: ok(modelsDev) })).source, "models.dev");
  const fallback = await fetchPricing({ fetchImpl: (url) => (String(url).includes("models.dev") ? { ok: false } : ok(vercel)()) });
  assert.equal(fallback.source, "vercel");
  await assert.rejects(fetchPricing({ fetchImpl: async () => { throw new Error("down"); } }));
});

test("applyPricing backfills zero-priced models only, registry wins where priced", () => {
  const pool = [
    { provider: "aperture-anthropic", id: "claude-opus-5-5", cost: { input: 0, output: 0 } },
    { provider: "anthropic", id: "claude-opus-5-5", cost: { input: 5, output: 25 } },
    { provider: "mlx", id: "coder", cost: { input: 0, output: 0 } },
  ];
  const prices = { claudeopus55: { input: 5, output: 25 } };
  const priced = applyPricing(pool, prices, normalizeModelId);
  assert.deepEqual(priced[0].cost, { input: 5, output: 25 });
  assert.deepEqual(priced[1].cost, { input: 5, output: 25 });
  assert.deepEqual(priced[2].cost, { input: 0, output: 0 });
  assert.equal(applyPricing(pool, null, normalizeModelId), pool);
});

test("pricingStale flags missing fetchedAt and caches older than a day", () => {
  assert.equal(pricingStale(null), true);
  assert.equal(pricingStale({ fetchedAt: Date.now() }), false);
  assert.equal(pricingStale({ fetchedAt: Date.now() - 25 * 3600_000 }), true);
});

// --- jev judge ---

function judgeFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (response instanceof Error) throw response;
    return { ok: true, text: async () => JSON.stringify(response) };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const verdict = { answers: { pass: { type: "boolean", probability: 0.93 } }, model: "jev", usage: { tokens: 1 } };

test("evaluate posts the protocol headers and state, returns the verdict", async () => {
  const fetchImpl = judgeFetch(verdict);
  const v = await evaluate(
    { endpoint: "https://example.com/v4/ai/evaluation-model", apiKey: "k", task: "t", evidence: "e" },
    { fetchImpl },
  );
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, "https://example.com/v4/ai/evaluation-model");
  assert.equal(init.headers.Authorization, "Bearer k");
  assert.equal(init.headers["ai-model-id"], "typesafe-ai/jev");
  const body = JSON.parse(init.body);
  assert.equal(body.state.task, "t");
  assert.equal(body.state.changes, "e");
  assert.equal(body.questions.pass.type, "boolean");
  assert.deepEqual(v, { pass: true, probability: 0.93, model: "jev", usage: { tokens: 1 } });
});

test("evaluate truncates to the 24KB cap with evidence getting the larger share", async () => {
  const fetchImpl = judgeFetch(verdict);
  await evaluate(
    { endpoint: "https://example.com/j", apiKey: "k", task: "t".repeat(99_999), evidence: "e".repeat(99_999) },
    { fetchImpl },
  );
  assert.ok(fetchImpl.calls[0].init.body.length <= 24 * 1024);
  const body = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(body.state.task.length, 7850);
  assert.equal(body.state.changes.length, 15_702);
  assert.ok(body.state.changes.length > body.state.task.length);
});

test("evaluate grades pass at the 0.5 probability boundary", async () => {
  const pass = await evaluate(
    { endpoint: "https://example.com/j", apiKey: "k", task: "t", evidence: "e" },
    { fetchImpl: judgeFetch({ answers: { pass: { type: "boolean", probability: 0.5 } } }) },
  );
  const fail = await evaluate(
    { endpoint: "https://example.com/j", apiKey: "k", task: "t", evidence: "e" },
    { fetchImpl: judgeFetch({ answers: { pass: { type: "boolean", probability: 0.49 } } }) },
  );
  assert.equal(pass.pass, true);
  assert.equal(fail.pass, false);
});

test("evaluate rejects bad endpoints, HTTP errors, malformed responses, and timeouts", async () => {
  const args = { apiKey: "k", task: "t", evidence: "e" };
  for (const endpoint of ["ftp://example.com/j", "https://k@example.com/j", "https://example.com/j?x=1"]) {
    await assert.rejects(evaluate({ ...args, endpoint }, { fetchImpl: judgeFetch(verdict) }), /endpoint/);
  }
  const notOk = async () => ({ ok: false, status: 503, text: async () => "" });
  await assert.rejects(evaluate({ ...args, endpoint: "https://example.com/j" }, { fetchImpl: notOk }), /HTTP 503/);
  const notJson = async () => ({ ok: true, text: async () => "<html>" });
  await assert.rejects(evaluate({ ...args, endpoint: "https://example.com/j" }, { fetchImpl: notJson }), /not valid/);
  const missingAnswer = async () => ({ ok: true, text: async () => JSON.stringify({ answers: {} }) });
  await assert.rejects(evaluate({ ...args, endpoint: "https://example.com/j" }, { fetchImpl: missingAnswer }), /boolean answer/);
  const timeout = async () => { throw Object.assign(new Error(), { name: "TimeoutError" }); };
  await assert.rejects(evaluate({ ...args, endpoint: "https://example.com/j" }, { fetchImpl: timeout }), /timed out/);
});
