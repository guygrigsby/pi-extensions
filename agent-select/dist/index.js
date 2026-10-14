// agent-select/extensions/index.ts
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join as join2 } from "node:path";

// agent-select/extensions/agent-select-core.mjs
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
function toCandidates(models, { freeProviders = [] } = {}) {
  const free = new Set(freeProviders);
  return models.filter((m) => (m.type ?? "chat") === "chat").map((m) => {
    const caps = [...m.input ?? []];
    if (m.reasoning) caps.push("reasoning");
    const c = { id: `${m.provider}/${m.id}`, caps: caps.sort() };
    if (m.contextWindow > 0) c.context_tokens = m.contextWindow;
    if (m.maxTokens > 0) c.max_output_tokens = m.maxTokens;
    const isFree = free.has(m.provider);
    for (const [from, to] of [["input", "input_usd_per_mtok"], ["output", "output_usd_per_mtok"]]) {
      const v = m.cost?.[from];
      if (isFree) c[to] = 0;
      else if (typeof v === "number" && v > 0) c[to] = v;
    }
    return c;
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function buildRequest(params, candidates, scores) {
  const task = {
    name: params.task,
    mode: params.mode ?? "cost",
    need: params.need ?? [],
    input_tokens: params.input_tokens ?? 0,
    output_tokens: params.output_tokens ?? 0,
    allow_unscored: true
  };
  if (params.max_cost_usd !== void 0) task.max_cost_usd = params.max_cost_usd;
  return { task, candidates, scores };
}
function exec(cli, args, input, signal, jevUrl) {
  return new Promise((resolve, reject) => {
    const env = jevUrl ? { ...process.env, TYPESAFE_URL: jevUrl } : process.env;
    const child = spawn(cli, args, { signal, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => stdout += d);
    child.stderr.on("data", (d) => stderr += d);
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr: stderr.trim() }));
    child.stdin.end(input);
  });
}
async function rank({ cli, history, minRuns, request, signal }) {
  const args = ["rank"];
  if (history) args.push("--history", history);
  if (minRuns) args.push("--min-runs", String(minRuns));
  const { code, stdout, stderr } = await exec(cli, args, JSON.stringify(request), signal);
  if (code !== 0 && code !== 3) throw new Error(`agent-select rank exit ${code}${stderr ? `: ${stderr}` : ""}`);
  const res = JSON.parse(stdout);
  if (stderr) res.warnings = stderr.split("\n");
  return res;
}
async function record({ cli, history, task, model, verdict, signal }) {
  if (verdict !== "pass" && verdict !== "fail") throw new Error(`verdict must be pass or fail, got ${verdict}`);
  const args = ["record", "--history", history, "--task", task, "--id", model, "--verdict", verdict];
  const { code, stderr } = await exec(cli, args, "", signal);
  if (code !== 0) throw new Error(`agent-select record exit ${code}${stderr ? `: ${stderr}` : ""}`);
}
var DEFAULT_TAXONOMY = {
  tasks: {
    code: "write, fix or change source code",
    review: "review a code change or design and comment on it",
    research: "find, read and summarize information",
    docs: "write prose documentation"
  },
  caps: {
    image: "reading images or screenshots",
    reasoning: "hard multi-step problem solving: debugging an unknown failure, design, proofs; not routine edits"
  }
};
async function classify({ cli, jevUrl, taxonomy = DEFAULT_TAXONOMY, prompt, signal }) {
  const dir = await mkdtemp(join(tmpdir(), "agent-select-"));
  try {
    const path = join(dir, "taxonomy.json");
    await writeFile(path, JSON.stringify(taxonomy));
    const { code, stdout, stderr } = await exec(cli, ["classify", "--taxonomy", path], prompt, signal, jevUrl);
    if (code !== 0) throw new Error(`agent-select classify exit ${code}${stderr ? `: ${stderr}` : ""}`);
    const { name = "", need = null, input_tokens, output_tokens } = JSON.parse(stdout).task;
    return { name, need, input_tokens, output_tokens };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
function mergeClassified(params, c) {
  const out = { ...params };
  if (out.task === void 0 && c.name) out.task = c.name;
  if (out.need === void 0 && c.need) out.need = c.need;
  for (const k of ["input_tokens", "output_tokens"]) if (out[k] === void 0 && c[k] > 0) out[k] = c[k];
  return out;
}
async function judge({ cli, jevUrl, history, task, model, request, result, signal }) {
  const args = ["judge", "--history", history, "--task", task, "--id", model];
  const { code, stdout, stderr } = await exec(cli, args, JSON.stringify({ request, result }), signal, jevUrl);
  if (code !== 0 && code !== 3) throw new Error(`agent-select judge exit ${code}${stderr ? `: ${stderr}` : ""}`);
  return JSON.parse(stdout);
}
var ALTERNATIVES = 3;
function summarize(res) {
  const line = (r) => {
    const score = r.score ? `score ${r.score.Value.toFixed(2)} (${r.score.Basis})` : "unscored";
    const cost = r.cost_usd !== void 0 ? `$${r.cost_usd.toFixed(4)}` : "cost unknown";
    const warn = r.warnings?.length ? ` [${r.warnings.join(", ")}]` : "";
    return `${r.id}  ${score}, ${cost}${warn}`;
  };
  const [best, ...rest] = res.ranked ?? [];
  const out = best ? [`model: ${best.id}`, `  ${line(best)}`] : ["no candidate fits the task"];
  if (rest.length) out.push("alternatives:", ...rest.slice(0, ALTERNATIVES).map((r) => `  ${line(r)}`));
  if (res.rejected?.length) out.push("rejected:", ...res.rejected.map((r) => `  ${r.ID}: ${r.Reasons.join(", ")}`));
  if (res.warnings?.length) out.push(...res.warnings.map((w) => `warning: ${w}`));
  return out.join("\n");
}

// agent-select/extensions/index.ts
var AGENT_DIR = process.env.PI_CODING_AGENT_DIR ?? join2(homedir(), ".pi", "agent");
var CONFIG_PATH = join2(AGENT_DIR, "agent-select.json");
function loadConfig() {
  let raw = {};
  try {
    raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
  }
  const str = (v, d) => typeof v === "string" && v ? v : d;
  return {
    cli: str(raw.cli, "agent-select"),
    history: str(raw.history, join2(AGENT_DIR, "agent-select", "outcomes.jsonl")),
    minRuns: Number.isInteger(raw.minRuns) && raw.minRuns > 0 ? raw.minRuns : 5,
    freeProviders: Array.isArray(raw.freeProviders) ? raw.freeProviders : [],
    scores: raw.scores && typeof raw.scores === "object" ? raw.scores : {},
    jevUrl: str(raw.jevUrl, ""),
    taxonomy: raw.taxonomy && typeof raw.taxonomy === "object" ? raw.taxonomy : DEFAULT_TAXONOMY
  };
}
var TASK_DESCRIPTION = "Short task kind, reused verbatim when recording the outcome so history accumulates: code, review, research, docs.";
var routeTool = defineTool({
  name: "route_subagent",
  label: "Route subagent",
  description: "Pick the model for a subagent spawn from the live model registry. Returns the provider/id to pass as the spawn's model, with alternatives to fall back to if it fails. Cost mode takes the cheapest model that fits; quality mode takes the best scored, from recorded outcomes first and declared scores second. Pass the subagent's prompt to have Jev fill task, need and token sizes you leave out.",
  parameters: Type.Object({
    task: Type.Optional(Type.String({ description: TASK_DESCRIPTION + " Required unless prompt is given." })),
    prompt: Type.Optional(
      Type.String({ description: "The prompt the subagent will get. Jev classifies it for any of task, need, input_tokens, output_tokens left out." })
    ),
    mode: Type.Optional(Type.Union([Type.Literal("cost"), Type.Literal("quality")], { description: "Default cost." })),
    need: Type.Optional(
      Type.Array(Type.String(), { description: 'Capabilities the model must have: "text", "image", "reasoning".' })
    ),
    input_tokens: Type.Optional(Type.Integer({ minimum: 0, description: "Estimated prompt tokens; sizes the context check and cost." })),
    output_tokens: Type.Optional(Type.Integer({ minimum: 0, description: "Estimated output tokens." })),
    max_cost_usd: Type.Optional(Type.Number({ minimum: 0, description: "Reject models estimated above this, or unpriced." }))
  }),
  async execute(_id, params, signal, _onUpdate, ctx) {
    const config = loadConfig();
    const reg = ctx.modelRegistry;
    const models = reg.getAvailable?.() ?? reg.getAll();
    let routeParams = params;
    const warnings = [];
    if (params.prompt) {
      try {
        const c = await classify({ cli: config.cli, jevUrl: config.jevUrl, taxonomy: config.taxonomy, prompt: params.prompt, signal });
        routeParams = mergeClassified(params, c);
        if (!params.task) warnings.push(`classified as ${routeParams.task ?? "none"}, need ${JSON.stringify(routeParams.need ?? [])}`);
      } catch (err) {
        warnings.push(`classification failed: ${err.message}`);
      }
    }
    if (!routeParams.task) {
      const known = Object.keys(config.taxonomy.tasks ?? {}).join(", ");
      const why = warnings.length ? ` (${warnings.join("; ")})` : "";
      return { content: [{ type: "text", text: `routing needs a task: pass one of ${known}${why}` }], isError: true };
    }
    const request = buildRequest(routeParams, toCandidates(models, config), config.scores);
    try {
      const res = await rank({ cli: config.cli, history: config.history, minRuns: config.minRuns, request, signal });
      if (warnings.length) res.warnings = [...warnings, ...res.warnings ?? []];
      return { content: [{ type: "text", text: summarize(res) }], details: res };
    } catch (err) {
      return { content: [{ type: "text", text: `routing failed: ${err.message}` }], isError: true };
    }
  }
});
var recordTool = defineTool({
  name: "record_subagent_outcome",
  label: "Record subagent outcome",
  description: "Record whether a routed subagent's work passed. Only for a verdict a mechanical check decided (tests, build, lint, CI) on the subagent's actual changes, never its own report or your impression. Skip it when nothing mechanical ran.",
  parameters: Type.Object({
    task: Type.String({ description: "The task passed to route_subagent." }),
    model: Type.String({ description: "provider/id the subagent ran on." }),
    verdict: Type.Union([Type.Literal("pass"), Type.Literal("fail")]),
    check: Type.String({ description: "The mechanical check that decided it, e.g. `make test`." })
  }),
  async execute(_id, params, signal) {
    const config = loadConfig();
    try {
      mkdirSync(dirname(config.history), { recursive: true });
      await record({ cli: config.cli, history: config.history, task: params.task, model: params.model, verdict: params.verdict, signal });
      return { content: [{ type: "text", text: `recorded ${params.verdict} for ${params.model} on ${params.task} (${params.check})` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `record failed: ${err.message}` }], isError: true };
    }
  }
});
var judgeTool = defineTool({
  name: "judge_subagent_outcome",
  label: "Judge subagent outcome",
  description: "Have Jev grade a routed subagent's work and record the verdict when it is sure. Only when no mechanical check ran; use record_subagent_outcome when one did. result must be observable evidence (the diff, test or command output), never the subagent's own summary: a claim of success is not evidence.",
  parameters: Type.Object({
    task: Type.String({ description: "The task route_subagent routed." }),
    model: Type.String({ description: "provider/id the subagent ran on." }),
    request: Type.String({ description: "What the subagent was asked to do." }),
    result: Type.String({ description: "Observable evidence of what it did: diff, test or command output." })
  }),
  async execute(_id, params, signal) {
    const config = loadConfig();
    try {
      mkdirSync(dirname(config.history), { recursive: true });
      const v = await judge({ cli: config.cli, jevUrl: config.jevUrl, history: config.history, ...params, signal });
      const text = v.decided ? `recorded ${v.pass ? "pass" : "fail"} for ${params.model} on ${params.task} (${v.model}, p=${v.p})` : `undecided (${v.model}, p=${v.p}); nothing recorded`;
      return { content: [{ type: "text", text }], details: v };
    } catch (err) {
      return { content: [{ type: "text", text: `judge failed: ${err.message}` }], isError: true };
    }
  }
});
function index_default(pi) {
  pi.registerTool(routeTool);
  pi.registerTool(recordTool);
  pi.registerTool(judgeTool);
}
export {
  index_default as default
};
