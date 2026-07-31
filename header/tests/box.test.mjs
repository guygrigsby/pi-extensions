import { test } from "node:test";
import assert from "node:assert/strict";
import {
	stripAnsi,
	visibleWidth,
	fit,
	columnWidths,
	layoutBox,
	pickTips,
	changelogHighlights,
	shortPath,
	hexToFg,
	MIN_BOX_WIDTH,
	MIN_TWO_COL_WIDTH,
	MAX_BOX_WIDTH,
} from "../extensions/header-core.mjs";

const cell = (text, align) => ({ text, align });

test("visibleWidth ignores color escapes", () => {
	assert.equal(stripAnsi("\x1b[38;2;255;79;163mpi\x1b[39m"), "pi");
	assert.equal(visibleWidth("\x1b[1mpi\x1b[22m"), 2);
	assert.equal(visibleWidth("plain"), 5);
});

test("fit pads short text and truncates long text to exactly w columns", () => {
	assert.equal(fit("pi", 5), "pi   ");
	assert.equal(visibleWidth(fit("pi", 5)), 5);
	assert.equal(fit("abcdefgh", 5), "abcd…");
	assert.equal(visibleWidth(fit("abcdefgh", 5)), 5);
	assert.equal(fit("", 3), "   ");
});

test("columnWidths splits the inner width, or refuses when too narrow", () => {
	const { leftW, rightW } = columnWidths(100);
	// │ left │ right │ — 7 columns of border and padding
	assert.equal(leftW + rightW + 7, 100);
	assert.ok(leftW >= 26 && leftW <= 46);
	assert.equal(columnWidths(MIN_TWO_COL_WIDTH - 1), null);
});

test("layoutBox: every row is exactly the terminal width", () => {
	const rows = layoutBox({
		title: "pi v0.83.0",
		left: [cell("Welcome back Guy!", "center"), cell("kimi-k3")],
		right: [cell("Tips for getting started"), cell("Run /init to make an AGENTS.md")],
		width: 100,
	});
	for (const row of rows) assert.equal(visibleWidth(row), 100);
});

test("layoutBox: a very wide terminal gets a capped box, not a stretched one", () => {
	const rows = layoutBox({ title: "pi", left: [cell("a")], right: [cell("b")], width: 200 });
	for (const row of rows) assert.equal(visibleWidth(row), MAX_BOX_WIDTH);
});

test("layoutBox: title sits inset in the top border, corners are rounded", () => {
	const rows = layoutBox({
		title: "pi v0.83.0",
		left: [cell("hi")],
		right: [cell("there")],
		width: 100,
	});
	assert.match(rows[0], /^╭─ pi v0\.83\.0 ─+┬─+╮$/);
	assert.match(rows[rows.length - 1], /^╰─+┴─+╯$/);
});

test("layoutBox: the divider column is the same in every row", () => {
	const rows = layoutBox({
		title: "pi",
		left: [cell("a"), cell("b")],
		right: [cell("c")],
		width: 100,
	});
	const col = rows[0].indexOf("┬");
	assert.ok(col > 0);
	for (const row of rows.slice(1, -1)) assert.equal(row[col], "│");
	assert.equal(rows[rows.length - 1][col], "┴");
});

test("layoutBox: short column is padded to the tall one", () => {
	const rows = layoutBox({
		title: "pi",
		left: [cell("a"), cell("b"), cell("c"), cell("d")],
		right: [cell("only one")],
		width: 100,
	});
	// 4 content rows plus two borders
	assert.equal(rows.length, 6);
});

test("layoutBox: below the two-column floor it stacks into one column", () => {
	const rows = layoutBox({
		title: "pi",
		left: [cell("left one")],
		right: [cell("right one")],
		width: 60,
	});
	for (const row of rows) assert.equal(visibleWidth(row), 60);
	assert.ok(!rows.some((r) => r.includes("┬")));
	assert.ok(rows.some((r) => r.includes("left one")));
	assert.ok(rows.some((r) => r.includes("right one")));
});

test("layoutBox: refuses to draw a box in a very narrow terminal", () => {
	assert.equal(layoutBox({ title: "pi", left: [cell("a")], right: [], width: MIN_BOX_WIDTH - 1 }), null);
});

test("layoutBox: centers what asks to be centered", () => {
	const rows = layoutBox({
		title: "pi",
		left: [cell("ab", "center")],
		right: [],
		width: 100,
	});
	const { leftW } = columnWidths(100);
	const inner = rows[1].slice(2, 2 + leftW);
	const lead = inner.length - inner.trimStart().length;
	assert.equal(lead, Math.floor((leftW - 2) / 2));
});

test("pickTips rotates deterministically and never over-draws", () => {
	const tips = ["a", "b", "c", "d"];
	assert.deepEqual(pickTips(tips, 2, 0), ["a", "b"]);
	assert.deepEqual(pickTips(tips, 2, 3), ["d", "a"]);
	assert.deepEqual(pickTips(tips, 9, 0).length, 4);
	assert.deepEqual(pickTips([], 2, 0), []);
});

test("changelogHighlights pulls the newest release's feature titles", () => {
	const md = [
		"# Changelog",
		"",
		"## [0.83.0] - 2026-07-29",
		"",
		"### New Features",
		"",
		"- **Credential export for external clients** — `pi auth print-api-key` exports credentials.",
		"- **Headless OpenRouter sign-in** — Complete `/login` over SSH.",
		"",
		"### Breaking Changes",
		"",
		"- Upgraded bundled TypeBox aliases to 1.3.7.",
		"",
		"## [0.82.0] - 2026-07-01",
		"",
		"### New Features",
		"",
		"- **Old news** — should not appear.",
	].join("\n");
	assert.deepEqual(changelogHighlights(md, 2), [
		"Credential export for external clients",
		"Headless OpenRouter sign-in",
	]);
	assert.equal(changelogHighlights(md, 1).length, 1);
});

test("changelogHighlights falls back to Added, then to nothing", () => {
	const md = ["## [1.0.0]", "", "### Added", "", "- Added `pi auth` commands ([#7168](https://x)).", ""].join("\n");
	assert.deepEqual(changelogHighlights(md, 2), ["Added pi auth commands"]);
	assert.deepEqual(changelogHighlights("", 2), []);
	assert.deepEqual(changelogHighlights("## [1.0.0]\n\n### Fixed\n\n- nope\n", 2), []);
});

test("shortPath tildes home and truncates from the left", () => {
	const home = "/Users/guy";
	assert.equal(shortPath("/Users/guy/projects/pi", home, 40), "~/projects/pi");
	assert.equal(shortPath("/Users/guy/projects/pi-extensions", home, 20), "…jects/pi-extensions");
	assert.equal(visibleWidth(shortPath("/Users/guy/projects/pi-extensions", home, 20)), 20);
	assert.equal(shortPath("/etc", home, 40), "/etc");
	assert.equal(shortPath("", home, 40), "");
});

test("hexToFg emits a truecolor escape, or nothing for junk", () => {
	assert.equal(hexToFg("#ff4fa3"), "\x1b[38;2;255;79;163m");
	assert.equal(hexToFg("ff4fa3"), "\x1b[38;2;255;79;163m");
	assert.equal(hexToFg("nope"), null);
	assert.equal(hexToFg(""), null);
	assert.equal(hexToFg(undefined), null);
});
