import { test } from "node:test";
import assert from "node:assert/strict";
import {
	BRANCH_ICON,
	MODEL_ICON,
	fitParts,
	joinParts,
	modelLabel,
	partText,
	renderStatusline,
	repoName,
	statusParts,
} from "../extensions/statusline-core.mjs";

// Colors carry through as tags so the expected line reads as the real layout.
const theme = { fg: (color, text) => `<${color}>${text}</${color}>` };

test("repoName takes the checkout directory name", () => {
	assert.equal(repoName("/Users/guy/projects/pi-extensions"), "pi-extensions");
	assert.equal(repoName("/Users/guy/projects/pi-extensions/"), "pi-extensions");
	assert.equal(repoName("/Users/guy/Projects With Spaces/repo"), "repo");
});

test("repoName drops the segment when there is no name to show", () => {
	assert.equal(repoName("/"), "");
	assert.equal(repoName(""), "");
	assert.equal(repoName(undefined), "");
	assert.equal(repoName(null), "");
});

test("modelLabel puts a colon between provider and model", () => {
	assert.equal(modelLabel({ provider: "aperture-completions", id: "z-ai/glm-5.3" }), "aperture-completions:z-ai/glm-5.3");
	assert.equal(modelLabel({ provider: "cline-pass", id: "kimi-k3" }), "cline-pass:kimi-k3");
});

test("modelLabel survives a missing model or provider", () => {
	assert.equal(modelLabel(undefined), "");
	assert.equal(modelLabel({ id: "glm-5.3" }), "glm-5.3");
	assert.equal(modelLabel({ provider: "openai" }), "");
	assert.equal(modelLabel({}), "");
});

test("statusParts orders model, repo, branch and drops empties", () => {
	assert.deepEqual(statusParts("m", "r", "b"), [
		{ kind: "model", icon: MODEL_ICON, text: "m" },
		{ kind: "repo", text: "r" },
		{ kind: "branch", icon: BRANCH_ICON, text: "b" },
	]);
	assert.deepEqual(statusParts("m", "", "b"), [
		{ kind: "model", icon: MODEL_ICON, text: "m" },
		{ kind: "branch", icon: BRANCH_ICON, text: "b" },
	]);
	assert.deepEqual(statusParts("", "", ""), []);
});

test("partText puts one space between icon and text", () => {
	assert.equal(partText({ kind: "model", icon: MODEL_ICON, text: "m" }), `${MODEL_ICON} m`);
	assert.equal(partText({ kind: "repo", text: "pi-extensions" }), "pi-extensions");
});

test("joinParts lays the line out with two-space separators", () => {
	assert.equal(
		joinParts(statusParts("aperture-completions:z-ai/glm-5.3", "pi-extensions", "main")),
		`${MODEL_ICON} aperture-completions:z-ai/glm-5.3  pi-extensions  ${BRANCH_ICON} main`,
	);
});

test("fitParts leaves a line that already fits alone", () => {
	const parts = statusParts("m", "repo", "main");
	assert.deepEqual(fitParts(parts, 80), parts);
	assert.deepEqual(fitParts(parts, joinParts(parts).length), parts);
});

test("fitParts drops repo then branch before trimming the model", () => {
	const parts = statusParts("provider:model-name", "pi-extensions", "main");
	assert.deepEqual(fitParts(parts, 34), statusParts("provider:model-name", "", "main"));
	assert.deepEqual(fitParts(parts, 22), statusParts("provider:model-name", "", ""));
});

test("fitParts trims the model label to whatever room is left", () => {
	const parts = statusParts("provider:model-name", "pi-extensions", "main");
	// The icon and its space spend two columns before the label starts.
	assert.deepEqual(fitParts(parts, 13), [{ kind: "model", icon: MODEL_ICON, text: "provider:mo" }]);
	assert.deepEqual(fitParts(parts, 10), [{ kind: "model", icon: MODEL_ICON, text: "provider" }]);
});

test("fitParts yields nothing when there is no room at all", () => {
	const parts = statusParts("provider:model", "repo", "main");
	assert.deepEqual(fitParts(parts, 0), []);
	assert.deepEqual(fitParts(parts, -1), []);
	assert.deepEqual(fitParts(parts, 2), []);
});

test("renderStatusline colors the model muted and repo/branch dim", () => {
	assert.equal(
		renderStatusline(
			theme,
			{ model: "aperture-zai:glm-5.3", repo: "autophage", branch: "main" },
			120,
		),
		`<muted>${MODEL_ICON} aperture-zai:glm-5.3</muted>  <dim>autophage</dim>  <dim>${BRANCH_ICON} main</dim>`,
	);
});

test("renderStatusline keeps the model and spends the last columns on it", () => {
	assert.equal(
		renderStatusline(theme, { model: "aperture-zai:glm-5.3", repo: "autophage", branch: "main" }, 20),
		`<muted>${MODEL_ICON} aperture-zai:glm-5</muted>`,
	);
});

test("renderStatusline degrades to an empty line with no model and no branch", () => {
	assert.equal(renderStatusline(theme, { model: "", repo: "", branch: "" }, 80), "");
});
