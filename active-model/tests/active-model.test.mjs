import { test } from "node:test";
import assert from "node:assert/strict";
import { activeModelBlock } from "../extensions/active-model-core.mjs";

test("activeModelBlock names the provider/id and guards routing", () => {
  const block = activeModelBlock({ provider: "openrouter", id: "moonshotai/kimi-k3" });
  assert.match(block, /<active-model>/);
  assert.match(block, /openrouter\/moonshotai\/kimi-k3/);
  assert.match(block, /cheap or local/);
  assert.match(block, /<\/active-model>$/);
});

test("activeModelBlock is empty when the model is unknown", () => {
  assert.equal(activeModelBlock(undefined), "");
  assert.equal(activeModelBlock({ provider: "x" }), "");
  assert.equal(activeModelBlock({ id: "y" }), "");
});
