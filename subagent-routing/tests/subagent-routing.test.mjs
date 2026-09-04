import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MODES,
  TIERS,
  assignTiers,
  buildPolicy,
  costScore,
} from "../extensions/subagent-routing-core.mjs";

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
  assert.match(p, /Stop after two failed reviews/);
});

test("policy says do it yourself when nothing else is configured", () => {
  const p = buildPolicy([{ provider: "moonshotai", id: "kimi-k3" }], { selfId: "moonshotai/kimi-k3" });
  assert.match(p, /do all work yourself/);
});
