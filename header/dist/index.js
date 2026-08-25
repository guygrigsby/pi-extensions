// header/extensions/index.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { VERSION, getPackageDir } from "@earendil-works/pi-coding-agent";

// header/extensions/header-core.mjs
var ANSI_FG_RESET = "\x1B[39m";
var MIN_BOX_WIDTH = 46;
var MIN_TWO_COL_WIDTH = 80;
var MAX_BOX_WIDTH = 120;
var TWO_COL_FRAME = 7;
var ONE_COL_FRAME = 4;
var LEFT_SHARE = 0.4;
var LEFT_MIN = 26;
var LEFT_MAX = 46;
var RIGHT_MIN = 20;
function fit(text, w) {
  const s = String(text ?? "");
  if (w <= 0) return "";
  if (s.length === w) return s;
  if (s.length < w) return s + " ".repeat(w - s.length);
  return w === 1 ? "\u2026" : s.slice(0, w - 1) + "\u2026";
}
function columnWidths(width) {
  if (width < MIN_TWO_COL_WIDTH) return null;
  const inner = width - TWO_COL_FRAME;
  const leftW = Math.min(LEFT_MAX, Math.max(LEFT_MIN, Math.round(inner * LEFT_SHARE)));
  const rightW = inner - leftW;
  return rightW < RIGHT_MIN ? null : { leftW, rightW };
}
var identity = (s) => s;
function resolveStyle(style) {
  return { border: style?.border ?? identity, title: style?.title ?? identity };
}
function renderCell(cell, w) {
  if (!cell) return " ".repeat(w);
  const text = String(cell.text ?? "");
  const lead = cell.align === "center" ? Math.max(0, Math.floor((w - text.length) / 2)) : 0;
  const body = fit(" ".repeat(lead) + text, w);
  return cell.style ? cell.style(body) : body;
}
function topBorder(width, title, leftSeg, style) {
  const s = resolveStyle(style);
  const rightSeg = leftSeg === null ? null : width - leftSeg - 3;
  const firstSeg = leftSeg === null ? width - 2 : leftSeg;
  const label = title ? `\u2500 ${title} ` : "";
  const shown = label.length > firstSeg ? "" : label;
  const head = shown ? s.border("\u2500 ") + s.title(title) + s.border(" ") : "";
  let out = s.border("\u256D") + head + s.border("\u2500".repeat(firstSeg - shown.length));
  if (rightSeg !== null) out += s.border("\u252C") + s.border("\u2500".repeat(rightSeg));
  return out + s.border("\u256E");
}
function bottomBorder(width, leftSeg, style) {
  const s = resolveStyle(style);
  if (leftSeg === null) return s.border("\u2570" + "\u2500".repeat(width - 2) + "\u256F");
  const rightSeg = width - leftSeg - 3;
  return s.border("\u2570" + "\u2500".repeat(leftSeg) + "\u2534" + "\u2500".repeat(rightSeg) + "\u256F");
}
function layoutBox({ title, left = [], right = [], width, style }) {
  if (width < MIN_BOX_WIDTH) return null;
  const s = resolveStyle(style);
  const boxW = Math.min(width, MAX_BOX_WIDTH);
  const cols = columnWidths(boxW);
  if (!cols) {
    const inner = boxW - ONE_COL_FRAME;
    const cells = left.length && right.length ? [...left, { text: "" }, ...right] : [...left, ...right];
    const rows2 = cells.map((c) => s.border("\u2502") + " " + renderCell(c, inner) + " " + s.border("\u2502"));
    return [topBorder(boxW, title, null, style), ...rows2, bottomBorder(boxW, null, style)];
  }
  const { leftW, rightW } = cols;
  const height = Math.max(left.length, right.length);
  const rows = [];
  for (let i = 0; i < height; i++) {
    rows.push(
      s.border("\u2502") + " " + renderCell(left[i], leftW) + " " + s.border("\u2502") + " " + renderCell(right[i], rightW) + " " + s.border("\u2502")
    );
  }
  return [topBorder(boxW, title, leftW + 2, style), ...rows, bottomBorder(boxW, leftW + 2, style)];
}
function pickTips(tips, n, seed) {
  if (!tips.length) return [];
  const take = Math.min(n, tips.length);
  const start = (seed % tips.length + tips.length) % tips.length;
  return Array.from({ length: take }, (_, i) => tips[(start + i) % tips.length]);
}
function bulletTitle(body) {
  const bold = body.match(/^\*\*(.+?)\*\*/);
  if (bold) return bold[1];
  return body.replace(/\s*\(\[#\d+\]\([^)]*\)[^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/`/g, "").replace(/\.\s*$/, "").trim().slice(0, 60);
}
function changelogHighlights(md, max) {
  const lines = String(md ?? "").split("\n");
  const start = lines.findIndex((l) => l.startsWith("## "));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  const release = end < 0 ? rest : rest.slice(0, end);
  for (const wanted of ["### New Features", "### Added"]) {
    const at = release.findIndex((l) => l.trim() === wanted);
    if (at < 0) continue;
    const out = [];
    for (const line of release.slice(at + 1)) {
      if (line.startsWith("### ")) break;
      const m = line.match(/^-\s+(.*)$/);
      if (m) out.push(bulletTitle(m[1]));
      if (out.length >= max) break;
    }
    if (out.length) return out;
  }
  return [];
}
function shortPath(p, home, w) {
  let s = String(p ?? "");
  if (home && s.startsWith(home)) s = "~" + s.slice(home.length);
  if (!w || s.length <= w) return s;
  return w <= 1 ? "\u2026" : "\u2026" + s.slice(s.length - (w - 1));
}
function hexToFg(hex) {
  const s = String(hex ?? "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  return `\x1B[38;2;${r};${g};${b}m`;
}
function timeOfDay(hour) {
  if (hour < 5) return "late night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
function firstToken(s) {
  return String(s ?? "").trim().split(/\s+/)[0] ?? "";
}
function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
function greetingName(...sources) {
  for (const src of sources) {
    const tok = firstToken(src);
    if (tok) return capitalize(tok);
  }
  return "there";
}

// header/extensions/index.ts
function gitUserName() {
  try {
    return execFileSync("git", ["config", "user.name"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}
var NAME = greetingName(process.env.PI_HEADER_NAME, gitUserName(), os.userInfo().username);
var HOME = os.homedir();
var DEFAULT_BRAND = "#ff4fa3";
var PI_GLYPH = [
  " \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 ",
  "  \u2588\u2588     \u2588\u2588   ",
  "  \u2588\u2588     \u2588\u2588   ",
  "  \u2588\u2588     \u2588\u2588   ",
  "  \u2588\u2588     \u2588\u2588\u2584  "
];
var TIPS = [
  "/hotkeys lists every key binding",
  "/model switches model mid-session",
  "/tree browses this session's branches",
  "/fork branches from an earlier message",
  "/compact summarizes to free context",
  "/resume picks up an earlier session",
  "/export writes the session to HTML"
];
function readHighlights() {
  try {
    return changelogHighlights(readFileSync(join(getPackageDir(), "CHANGELOG.md"), "utf8"), 2);
  } catch {
    return [];
  }
}
var HIGHLIGHTS = readHighlights();
function dayIndex(now) {
  return Math.floor(now.getTime() / 864e5);
}
var modelLine = "";
function header(pi) {
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    const model = ctx.model?.id ?? ctx.model?.name ?? "";
    const thinking = ctx.thinkingLevel ?? "";
    modelLine = [model, thinking].filter(Boolean).join(" \xB7 ");
    const cwd = ctx.cwd ?? process.cwd();
    const now = /* @__PURE__ */ new Date();
    ctx.ui.setHeader((_tui, theme) => ({
      render(width) {
        const fg = hexToFg(process.env.PI_HEADER_COLOR ?? DEFAULT_BRAND);
        const brand = fg ? (s) => fg + s + ANSI_FG_RESET : (s) => theme.fg("accent", s);
        const dim = (s) => theme.fg("dim", s);
        const muted = (s) => theme.fg("muted", s);
        const label = (s) => theme.fg("accent", theme.bold(s));
        const cols = columnWidths(Math.min(width, MAX_BOX_WIDTH));
        const rightW = cols?.rightW ?? 0;
        const left = [
          { text: `${timeOfDay(now.getHours())}, ${NAME}`, align: "center", style: (s) => theme.bold(s) },
          { text: "" },
          ...PI_GLYPH.map((l) => ({ text: l, align: "center", style: brand })),
          { text: "" },
          { text: modelLine, align: "center", style: dim },
          { text: shortPath(cwd, HOME, cols?.leftW ?? width), align: "center", style: dim }
        ];
        const tips = pickTips(TIPS, 2, dayIndex(now));
        const right = [
          { text: "Tips for getting started", style: label },
          ...tips.map((t) => ({ text: t, style: muted })),
          { text: "" },
          { text: "\u2500".repeat(Math.max(0, rightW)), style: (s) => theme.fg("borderMuted", s) }
        ];
        if (HIGHLIGHTS.length) {
          right.push(
            { text: `What's new in ${VERSION}`, style: label },
            ...HIGHLIGHTS.map((h) => ({ text: h, style: muted })),
            { text: "" },
            { text: "/changelog for more", style: dim }
          );
        }
        const box = layoutBox({ title: `pi v${VERSION}`, left, right, width, style: { border: brand, title: brand } });
        if (box) return ["", ...box];
        const side = ["", `${timeOfDay(now.getHours())}, ${NAME}`, "", "", ""];
        return ["", ...PI_GLYPH.map((l, i) => brand(l) + (side[i] ? "   " + muted(side[i]) : ""))];
      },
      invalidate() {
      }
    }));
  });
}
export {
  header as default
};
