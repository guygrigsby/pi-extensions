import { test } from "node:test";
import assert from "node:assert/strict";
import { timeOfDay, greetingName } from "../extensions/header-core.mjs";

test("timeOfDay buckets the clock", () => {
	assert.equal(timeOfDay(2), "late night");
	assert.equal(timeOfDay(9), "morning");
	assert.equal(timeOfDay(14), "afternoon");
	assert.equal(timeOfDay(21), "evening");
});

test("greetingName: first token of first non-empty source, capitalized", () => {
	assert.equal(greetingName("", "Guy J Grigsby", "guygrigsby"), "Guy");
	assert.equal(greetingName("Ada", "Guy J Grigsby", "gjg"), "Ada");
	assert.equal(greetingName("", "", "guygrigsby"), "Guygrigsby");
	assert.equal(greetingName(undefined, null, ""), "there");
});
