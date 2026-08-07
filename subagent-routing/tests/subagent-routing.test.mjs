import { test } from "node:test";
import assert from "node:assert/strict";
import { MODES, buildPolicy, costScore, rankModels } from "../extensions/subagent-routing-core.mjs";

const models = [
  { provider: "mlx", id: "coder", cost: { input: 0, output: 0 } },
  { provider: "kimi-coding", id: "kimi-for-coding", cost: { input: 0, output: 0 } },
  { provider: "deepseek", id: "deepseek-v4-flash", cost: { input: 0.1, output: 0.2 } },
  { provider: "deepseek", id: "deepseek-v4-pro", cost: { input: 0.5, output: 1 } },
  { provider: "moonshotai", id: "kimi-k3", cost: { input: 1, output: 2 } },
  { provider: "anthropic", id: "claude-opus-4-8", cost: { input: 5, output: 25 } },
];

test("costScore blends input and output, tolerates missing cost", () => {
  assert.equal(costScore({ cost: { input: 1, output: 2 } }), 3);
  assert.equal(costScore({}), 0);
});

test("rankModels excludes local models and the orchestrator's own model", () => {
  const picks = rankModels(models, { mode: "cost", selfId: "deepseek/deepseek-v4-flash" });
  assert.ok(!picks.some((m) => m.provider === "mlx"));
  assert.ok(!picks.some((m) => m.id === "deepseek-v4-flash"));
});

test("cost mode picks the cheapest, performance the priciest, balance the middle", () => {
  const cost = rankModels(models, { mode: "cost" }).map((m) => m.id);
  assert.deepEqual(cost, ["kimi-for-coding", "deepseek-v4-flash", "deepseek-v4-pro"]);

  const perf = rankModels(models, { mode: "performance" }).map((m) => m.id);
  assert.deepEqual(perf, ["claude-opus-4-8", "kimi-k3", "deepseek-v4-pro"]);

  const bal = rankModels(models, { mode: "balance" }).map((m) => m.id);
  assert.deepEqual(bal, ["deepseek-v4-flash", "deepseek-v4-pro", "kimi-k3"]);
});

test("rankModels degrades gracefully on a tiny pool", () => {
  const one = rankModels([models[1]], { mode: "performance" });
  assert.equal(one.length, 1);
  assert.equal(rankModels([], { mode: "cost" }).length, 0);
});

test("policy names the mode, lists picks, and keeps the review gate", () => {
  const p = buildPolicy(models, { mode: "cost", selfId: "moonshotai/kimi-k3" });
  assert.match(p, /Fan-out mode: cost/);
  assert.match(p, /kimi-coding\/kimi-for-coding/);
  assert.doesNotMatch(p, /mlx\/coder/);
  assert.doesNotMatch(p, /- moonshotai\/kimi-k3/);
  assert.match(p, /WITHOUT a `model` override/);
  assert.match(p, /reviewer/);
  assert.match(p, /run_in_background: true/);
  assert.match(p, /\/subagent-routing cost\|balance\|performance/);
});

test("policy says do it yourself when nothing else is configured", () => {
  const p = buildPolicy([{ provider: "moonshotai", id: "kimi-k3" }], { selfId: "moonshotai/kimi-k3" });
  assert.match(p, /do all work yourself/);
});

test("MODES is the advertised three", () => {
  assert.deepEqual(MODES, ["cost", "balance", "performance"]);
});
