import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, formatFull, formatSummary } from "../extensions/promptdump-core.mjs";

const sample = {
  model: "kimi",
  system: "you are helpful",
  messages: [
    { role: "user", content: "hello there" },
    { role: "assistant", content: [{ type: "text", text: "hi" }, { type: "image" }] },
  ],
};

test("normalize lifts the system field and flattens content shapes", () => {
  const parts = normalize(sample);
  assert.deepEqual(parts.map((p) => p.role), ["system", "user", "assistant"]);
  assert.equal(parts[0].text, "you are helpful");
  assert.equal(parts[1].text, "hello there");
  assert.equal(parts[2].text, "hi\n[image]");
});

test("normalize returns [] for junk", () => {
  assert.deepEqual(normalize(null), []);
  assert.deepEqual(normalize("nope"), []);
});

test("formatFull shows a header per role and the content", () => {
  const out = formatFull(sample);
  assert.match(out, /### system\nyou are helpful/);
  assert.match(out, /### user\nhello there/);
  assert.match(out, /### assistant\nhi\n\[image\]/);
});

test("formatFull falls back to raw JSON for an unrecognized payload", () => {
  assert.match(formatFull({ weird: 1 }), /"weird": 1/);
});

test("formatSummary is one line per message with sizes and an expand hint", () => {
  const out = formatSummary(sample);
  assert.match(out, /3 messages/);
  assert.match(out, /system\s+15 chars/);
  assert.match(out, /\/dump-context full to expand\./);
  // Folded: no full assistant content beyond the 80-char preview cap needed here,
  // but the hint and per-role lines must be present.
  assert.match(out, /user\s+11 chars/);
});
