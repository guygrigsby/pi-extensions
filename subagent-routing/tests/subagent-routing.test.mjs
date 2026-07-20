import { test } from "node:test";
import assert from "node:assert/strict";
import { SUBAGENT_ROUTING_POLICY } from "../extensions/subagent-routing-core.mjs";

test("policy routes cheap fan-out, inherits for judge/escalate, and reviews", () => {
  const p = SUBAGENT_ROUTING_POLICY;
  // cheap fan-out menu present
  assert.match(p, /openrouter\/deepseek\/deepseek-v4-flash/);
  // orchestrator/judge model is never named — it inherits
  assert.doesNotMatch(p, /moonshotai\/kimi-k3/);
  assert.match(p, /your own model/);
  assert.match(p, /WITHOUT a `model` override/);
  // review gate present
  assert.match(p, /reviewer/);
  assert.match(p, /run_in_background: true/);
});
