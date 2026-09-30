// lean/extensions/lean-tools.ts
import {
  createReadToolDefinition,
  createBashToolDefinition,
  createEditToolDefinition,
  createWriteToolDefinition,
  createGrepToolDefinition,
  createFindToolDefinition,
  createLsToolDefinition
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

// lean/extensions/lean-tools-core.mjs
var LEAN_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];
var TOOL_ICONS = {
  read: "\uF02D",
  // nf-fa-book
  bash: "\uF120",
  // nf-fa-terminal
  edit: "\uF040",
  // nf-fa-pencil
  write: "\uF0C7",
  // nf-fa-floppy_o (save)
  grep: "\uF002",
  // nf-fa-search
  find: "\uF07B",
  // nf-fa-folder
  ls: "\uF03A"
  // nf-fa-list
};
function toolIcon(name) {
  return TOOL_ICONS[name] ?? "\u2022";
}
function parseSkipList(raw) {
  return new Set(
    String(raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
}
function ownedElsewhere(allTools, name) {
  const tool = (allTools ?? []).find((t) => t?.name === name);
  const source = tool?.sourceInfo?.source;
  return Boolean(source && source !== "builtin");
}
function unknownTools(skip2) {
  return [...skip2].filter((name) => !LEAN_TOOLS.includes(name));
}
function shouldCompactRow({ toolName, hidden, expanded, renderShell }, skip2) {
  if (hidden || expanded) return false;
  if (renderShell === "self") return false;
  return !skip2.has(String(toolName ?? "").toLowerCase());
}
var TOOL_COL = 5;
function padTool(name) {
  return name.length >= TOOL_COL ? name + " " : name.padEnd(TOOL_COL, " ");
}
function toolTarget(name, args) {
  const a = args ?? {};
  switch (name) {
    case "bash": {
      const cmd = String(a.command ?? "");
      return cmd.length > 120 ? cmd.slice(0, 117) + "..." : cmd;
    }
    case "grep":
      return String(a.pattern ?? "");
    case "find":
      return String(a.path ?? "") + (a.pattern ? ` ${a.pattern}` : "");
    case "read":
    case "edit":
    case "write":
    case "ls":
      return String(a.path ?? "");
    default:
      return "";
  }
}
var MAX_CMD = 60;
function foldedCommand(name, args) {
  const t = toolTarget(name, args);
  return t.length > MAX_CMD ? t.slice(0, MAX_CMD - 1) + "\u2026" : t;
}
function resultText(result) {
  const content = result?.content ?? [];
  return content.filter((c) => c && c.type === "text").map((c) => c.text ?? "").join("\n");
}
function lineCount(s) {
  return s ? s.split("\n").length : 0;
}
function editCounts(diff) {
  let add = 0;
  let rem = 0;
  if (typeof diff !== "string") return { add, rem };
  for (const l of diff.split("\n")) {
    if (l.startsWith("+") && !l.startsWith("+++")) add++;
    else if (l.startsWith("-") && !l.startsWith("---")) rem++;
  }
  return { add, rem };
}
function foldSummary(name, result, isError) {
  if (isError) {
    const text = resultText(result);
    if (name === "bash") {
      const m = text.match(/exited with code (\d+)/);
      if (m) return { tone: "error", text: `\u2717 exit ${m[1]}` };
    }
    const first = (text.split("\n")[0] || "failed").trim();
    const msg = first.length > 60 ? first.slice(0, 57) + "..." : first;
    return { tone: "error", text: `\u2717 ${msg}` };
  }
  if (name === "edit") {
    const { add, rem } = editCounts(result?.details?.diff);
    return { tone: "edit", add, rem };
  }
  if (name === "write") {
    const n = lineCount(resultText(result));
    return { tone: "dim", text: n ? `(${n} lines)` : "" };
  }
  return { tone: "", text: "" };
}
function quietLabel(name) {
  switch (name) {
    case "bash":
      return "Ran shell command";
    case "read":
      return "Read";
    case "edit":
      return "Edited";
    case "write":
      return "Wrote";
    case "grep":
      return "Searched";
    case "find":
      return "Searched files";
    case "ls":
      return "Listed";
    default:
      return name;
  }
}

// lean/extensions/lean-tools.ts
var MODES = ["folded", "expanded", "hidden"];
function readDefaultMode() {
  const v = (process.env.PI_LEAN_MODE || "").trim().toLowerCase();
  return v === "expanded" || v === "hidden" ? v : "folded";
}
var mode = readDefaultMode();
var skip = parseSkipList(process.env.PI_LEAN_SKIP);
var leftAlone = new Set(skip);
var registeredByLean = /* @__PURE__ */ new Set();
var invalidators = /* @__PURE__ */ new Map();
var argsById = /* @__PURE__ */ new Map();
function track(context) {
  if (context.toolCallId) invalidators.set(context.toolCallId, context.invalidate);
}
function rerenderAll() {
  for (const inv of invalidators.values()) {
    try {
      inv();
    } catch {
    }
  }
}
var DELEGATABLE = /* @__PURE__ */ new Set(["read", "grep", "find", "ls"]);
function asText(context) {
  return context.lastComponent ?? new Text("", 0, 0);
}
function setText(context, content) {
  const t = asText(context);
  t.setText(content);
  return t;
}
function emptyText(context) {
  return setText(context, "");
}
function icon(name, theme) {
  return theme.fg("accent", `${toolIcon(name)} `);
}
function callLine(name, args, theme) {
  const label = theme.fg("toolTitle", theme.bold(padTool(name)));
  const target = theme.fg("accent", toolTarget(name, args));
  return icon(name, theme) + label + " " + target;
}
function foldedLine(name, args, result, isError, theme) {
  let line = icon(name, theme) + theme.fg("muted", foldedCommand(name, args)) + theme.fg("dim", `  ${quietLabel(name)}`);
  const s = foldSummary(name, result, isError);
  if (s.tone === "edit" && (s.add || s.rem)) {
    line += theme.fg("dim", ` (+${s.add} -${s.rem})`);
  } else if (s.tone === "error") {
    line += "  " + theme.fg("error", s.text);
  } else if (s.tone === "dim" && s.text) {
    line += theme.fg("dim", ` ${s.text}`);
  }
  return line;
}
function runningLine(name, args, theme) {
  return icon(name, theme) + theme.fg("muted", foldedCommand(name, args)) + theme.fg("dim", `  ${quietLabel(name)}`);
}
function expandedOwn(name, result, isError, theme) {
  const text = resultText(result);
  const details = result?.details ?? {};
  if (name === "edit") {
    const diff = details.diff;
    if (typeof diff === "string" && diff) {
      return diff.split("\n").map((l) => {
        if (l.startsWith("+") && !l.startsWith("+++")) return theme.fg("success", l);
        if (l.startsWith("-") && !l.startsWith("---")) return theme.fg("error", l);
        return theme.fg("dim", l);
      }).join("\n");
    }
    return isError ? theme.fg("error", text.split("\n")[0] || "failed") : theme.fg("success", "applied");
  }
  const out = text ? text.split("\n").map((l) => theme.fg("muted", l)).join("\n") : theme.fg("success", name === "write" ? "written" : "done");
  let s = out;
  const trunc = details.truncation;
  if (trunc?.truncated) {
    const by = trunc.truncatedBy === "lines" ? `${trunc.outputLines} of ${trunc.totalLines} lines` : `${trunc.outputLines} lines`;
    s += `
${theme.fg("warning", `[truncated: ${by}]`)}`;
  }
  if (details.fullOutputPath) s += `
${theme.fg("dim", `full output: ${details.fullOutputPath}`)}`;
  return s;
}
function registerLean(pi, cwd) {
  const factories = {
    read: createReadToolDefinition,
    bash: createBashToolDefinition,
    edit: createEditToolDefinition,
    write: createWriteToolDefinition,
    grep: createGrepToolDefinition,
    find: createFindToolDefinition,
    ls: createLsToolDefinition
  };
  let registry;
  try {
    registry = pi.getAllTools();
  } catch {
  }
  for (const name of LEAN_TOOLS) {
    if (skip.has(name)) continue;
    if (!registeredByLean.has(name) && ownedElsewhere(registry, name)) {
      leftAlone.add(name);
      continue;
    }
    registeredByLean.add(name);
    const orig = factories[name](cwd);
    pi.registerTool({
      name: orig.name,
      label: orig.label,
      description: orig.description,
      parameters: orig.parameters,
      prepareArguments: orig.prepareArguments,
      executionMode: orig.executionMode,
      renderShell: "self",
      // Behavior identical to the built-in — only rendering changes.
      execute: (toolCallId, params, signal, onUpdate, ctx) => orig.execute(toolCallId, params, signal, onUpdate, ctx),
      renderCall: (args, theme, context) => {
        track(context);
        if (context.toolCallId) argsById.set(context.toolCallId, args);
        if (mode === "hidden" && !context.isPartial) return emptyText(context);
        if (!context.isPartial) return emptyText(context);
        if (mode === "expanded") return setText(context, callLine(name, args, theme));
        return setText(context, runningLine(name, args, theme));
      },
      renderResult: (result, options, theme, context) => {
        track(context);
        if (options.isPartial) {
          if (name === "bash" && mode === "expanded") {
            const out = resultText(result);
            const tail = out ? out.split("\n").slice(-6) : [];
            return setText(context, tail.map((l) => theme.fg("muted", l)).join("\n"));
          }
          return emptyText(context);
        }
        if (mode === "hidden") return emptyText(context);
        const args = context.toolCallId ? argsById.get(context.toolCallId) : void 0;
        if (mode === "expanded" || options.expanded) {
          if (DELEGATABLE.has(name)) {
            return orig.renderResult(result, { ...options, expanded: true }, theme, context);
          }
          const header = callLine(name, args, theme);
          return setText(context, header + "\n" + expandedOwn(name, result, context.isError, theme));
        }
        return setText(context, foldedLine(name, args, result, context.isError, theme));
      }
    });
  }
}
function applyMode(next, ctx) {
  mode = next;
  rerenderAll();
  try {
    ctx.ui.notify(`Tool blocks: ${mode}`, "info");
  } catch {
  }
}
function cycleMode(ctx) {
  applyMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length], ctx);
}
function leanTools(pi) {
  pi.on("session_start", async (_event, ctx) => {
    invalidators.clear();
    argsById.clear();
    registerLean(pi, ctx.cwd ?? process.cwd());
    try {
      ctx.ui.setStatus("lean-tools", void 0);
      const bad = unknownTools(skip);
      if (bad.length) {
        ctx.ui.notify(`PI_LEAN_SKIP: no such tool: ${bad.join(", ")}`, "warning");
      }
    } catch {
    }
  });
  pi.registerShortcut("ctrl+q", {
    description: "Cycle tool-block view: folded \u2192 expanded \u2192 hidden",
    handler: async (ctx) => cycleMode(ctx)
  });
  pi.registerCommand("tools", {
    description: "Set or cycle tool-block view (folded | expanded | hidden)",
    handler: async (args, ctx) => {
      const a = String(args || "").trim().toLowerCase();
      if (a === "folded" || a === "expanded" || a === "hidden") applyMode(a, ctx);
      else cycleMode(ctx);
    }
  });
}

// lean/extensions/lean-anytool.ts
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
var FLAG = "__leanAnyToolPatched";
var DIM = (s) => `\x1B[2m${s}\x1B[0m`;
var ERR = (s) => `\x1B[31m${s}\x1B[0m`;
function compactLines(self, width) {
  const name = String(self.toolName ?? "tool");
  if (self.isPartial || !self.result) {
    return ["", DIM(`\u25B6 ${name}\u2026`)];
  }
  let out = "";
  try {
    out = self.getTextOutput?.() ?? "";
  } catch {
  }
  const first = out.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const plain = `\u25B6 ${name}` + (first ? `  ${first}` : "");
  const line = truncateToWidth(plain, Math.max(1, width), "...");
  return ["", self.result?.isError ? ERR(line) : DIM(line)];
}
function patch() {
  const proto = ToolExecutionComponent?.prototype;
  if (!proto || typeof proto.render !== "function") return;
  if (proto[FLAG]) return;
  const originalRender = proto.render;
  proto.render = function patchedRender(width) {
    try {
      if (typeof this.getRenderShell === "function" && shouldCompactRow(
        {
          toolName: this.toolName,
          hidden: this.hideComponent,
          expanded: this.expanded,
          renderShell: this.getRenderShell()
        },
        leftAlone
      )) {
        return compactLines(this, width);
      }
    } catch {
    }
    return originalRender.call(this, width);
  };
  proto[FLAG] = true;
}
function leanAnyTool(_pi) {
  if ((process.env.PI_LEAN_ANYTOOL || "on").trim().toLowerCase() === "off") return;
  try {
    patch();
  } catch {
  }
}

// lean/extensions/lean-prose.ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
var AGENT_DIR = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
var STATE = path.join(AGENT_DIR, "lean-prose.json");
var LAYER = `

## Output style: lean
Keep prose short and dense. Lead with the answer, no preamble or restating the
question. Cut filler and hedging; no "I'll help you", no summary of what you
just did unless asked. Prefer a sentence to a paragraph and a phrase to a
sentence. Use lists only when they carry more than prose would. This governs
tone and length ONLY \u2014 never trade away correctness, needed caveats, or the
completeness of the actual work.`;
function readEnabled() {
  try {
    const v = JSON.parse(fs.readFileSync(STATE, "utf8"));
    if (typeof v?.enabled === "boolean") return v.enabled;
  } catch {
  }
  return (process.env.PI_LEAN_PROSE || "on").trim().toLowerCase() !== "off";
}
function writeEnabled(enabled2) {
  try {
    fs.mkdirSync(AGENT_DIR, { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify({ enabled: enabled2 }));
  } catch {
  }
}
var enabled = readEnabled();
function leanProse(pi) {
  pi.on("before_agent_start", async (event) => {
    if (!enabled) return;
    return { systemPrompt: event.systemPrompt + LAYER };
  });
  pi.registerCommand("prose", {
    description: "Toggle lean prose (short, dense output). /prose on | off",
    handler: async (args, ctx) => {
      const a = String(args || "").trim().toLowerCase();
      enabled = a === "on" ? true : a === "off" ? false : !enabled;
      writeEnabled(enabled);
      ctx.ui.notify(`Lean prose ${enabled ? "on" : "off"}.`, "info");
    }
  });
}

// lean/extensions/lean-usermsg.ts
import { UserMessageComponent } from "@earendil-works/pi-coding-agent";
var FLAG2 = "__leanUserMsgPatched";
function patch2() {
  const proto = UserMessageComponent?.prototype;
  if (!proto || typeof proto.rebuild !== "function") return;
  if (proto[FLAG2]) return;
  const originalRebuild = proto.rebuild;
  proto.rebuild = function patchedRebuild() {
    const realAddChild = this.addChild;
    if (typeof realAddChild === "function") {
      this.addChild = function(child) {
        if (child && typeof child.paddingY === "number") child.paddingY = 0;
        return realAddChild.call(this, child);
      };
      try {
        originalRebuild.call(this);
      } finally {
        this.addChild = realAddChild;
      }
    } else {
      originalRebuild.call(this);
    }
  };
  proto[FLAG2] = true;
}
function leanUserMsg(_pi) {
  if ((process.env.PI_LEAN_USERMSG || "on").trim().toLowerCase() === "off") return;
  try {
    patch2();
  } catch {
  }
}

// lean/extensions/lean-spacing.ts
import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";
import { Spacer } from "@earendil-works/pi-tui";
var FLAG3 = "__leanSpacingPatched";
function isSpacer(c) {
  return c instanceof Spacer || c?.constructor?.name === "Spacer" || c && typeof c.setLines === "function" && "lines" in c;
}
function patch3() {
  const proto = AssistantMessageComponent?.prototype;
  if (!proto || typeof proto.updateContent !== "function") return;
  if (proto[FLAG3]) return;
  const originalUpdate = proto.updateContent;
  proto.updateContent = function patchedUpdate(message) {
    const cc = this.contentContainer;
    const realAddChild = cc?.addChild;
    if (cc && typeof realAddChild === "function") {
      cc.addChild = function(child) {
        if (isSpacer(child)) return;
        return realAddChild.call(this, child);
      };
      try {
        originalUpdate.call(this, message);
      } finally {
        cc.addChild = realAddChild;
      }
    } else {
      originalUpdate.call(this, message);
    }
  };
  proto[FLAG3] = true;
}
function leanSpacing(_pi) {
  if ((process.env.PI_LEAN_SPACING || "on").trim().toLowerCase() === "off") return;
  try {
    patch3();
  } catch {
  }
}

// lean/extensions/lean-thinking.ts
import { AssistantMessageComponent as AssistantMessageComponent2 } from "@earendil-works/pi-coding-agent";
var SENTINEL = "\0lean-hide-thinking\0";
var FLAG4 = "__leanThinkingPatched";
function patch4() {
  const proto = AssistantMessageComponent2?.prototype;
  if (!proto || typeof proto.updateContent !== "function") return;
  if (proto[FLAG4]) return;
  const originalUpdate = proto.updateContent;
  proto.updateContent = function patchedUpdate(message) {
    const cc = this.contentContainer;
    const realAddChild = cc?.addChild;
    if (cc && typeof realAddChild === "function") {
      cc.addChild = function(child) {
        if (typeof child?.text === "string" && child.text.includes(SENTINEL)) return;
        return realAddChild.call(this, child);
      };
      try {
        originalUpdate.call(this, message);
      } finally {
        cc.addChild = realAddChild;
      }
    } else {
      originalUpdate.call(this, message);
    }
  };
  proto[FLAG4] = true;
}
function leanThinking(pi) {
  if ((process.env.PI_LEAN_THINKING || "on").trim().toLowerCase() === "off") return;
  try {
    patch4();
  } catch {
  }
  pi.on("session_start", async (_event, ctx) => {
    try {
      ctx.ui.setHiddenThinkingLabel(SENTINEL);
    } catch {
    }
  });
}

// lean/extensions/index.ts
function lean(pi) {
  leanTools(pi);
  leanAnyTool(pi);
  leanProse(pi);
  leanUserMsg(pi);
  leanSpacing(pi);
  leanThinking(pi);
}
export {
  lean as default
};
