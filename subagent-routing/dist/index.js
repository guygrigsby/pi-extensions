// subagent-routing/extensions/index.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// subagent-routing/extensions/subagent-routing-core.mjs
var MODES = ["cost", "performance"];
var TIERS = ["cheap", "mid", "frontier"];
function costScore(model) {
  const c = model.cost ?? {};
  return (c.input ?? 0) + (c.output ?? 0);
}
function isLocal(model) {
  return model.provider === "mlx";
}
function dedupeById(models) {
  const best = /* @__PURE__ */ new Map();
  for (const m of models) {
    const seen = best.get(m.id);
    if (!seen || costScore(m) < costScore(seen)) best.set(m.id, m);
  }
  return [...best.values()];
}
function overrideFor(model, overrides) {
  const tier = overrides[`${model.provider}/${model.id}`] ?? overrides[`${model.provider}/*`];
  return TIERS.includes(tier) ? tier : void 0;
}
function assignTiers(models, { overrides = {}, selfId } = {}) {
  const pool = dedupeById(
    models.filter((m) => !isLocal(m) && `${m.provider}/${m.id}` !== selfId)
  ).sort((a, b) => costScore(a) - costScore(b));
  const tiers = { cheap: [], mid: [], frontier: [] };
  const c1 = Math.ceil(pool.length / 3);
  const c2 = Math.ceil(2 * pool.length / 3);
  pool.forEach((m, i) => {
    const tier = overrideFor(m, overrides) ?? (i < c1 ? "cheap" : i < c2 ? "mid" : "frontier");
    tiers[tier].push(m);
  });
  return tiers;
}
function tierLines(tierModels) {
  const byProvider = /* @__PURE__ */ new Map();
  for (const m of tierModels) {
    if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
    byProvider.get(m.provider).push(m);
  }
  return [...byProvider.entries()].map(
    ([provider, ms]) => `- ${provider}: ${ms.map((m) => `${m.id} ($${m.cost?.input ?? 0}/$${m.cost?.output ?? 0})`).join(", ")}`
  ).join("\n");
}
var MODE_RULES = {
  cost: `- Route each task to the cheapest tier plausibly adequate for it; well-specified mechanical work goes to cheap.
- Escalate one tier when a review fails; reach frontier only for genuinely hard tasks.`,
  performance: `- Route each task to the tier you would bet passes review first try: mechanical work still goes cheap, ambiguous specs and hard reasoning start at frontier, and any doubt moves you up a tier.
- Do not default to the priciest model; unnecessary capability is waste, not safety.`
};
function buildPolicy(models, { mode = "cost", overrides = {}, selfId } = {}) {
  const tiers = assignTiers(models, { overrides, selfId });
  const total = TIERS.reduce((n, t) => n + tiers[t].length, 0);
  const ladder = total === 0 ? "No other models are configured; do all work yourself." : TIERS.filter((t) => tiers[t].length > 0).map((t) => `### ${t}
${tierLines(tiers[t])}`).join("\n");
  return `<subagent-routing>
You are the orchestrator. Plan, spec, and judge yourself; fan implementation out to subagents and grade their work before accepting it. Your live model is stated in the <active-model> callout in your context; route relative to it (if you are already a cheap or local model, do the work yourself).

## Model ladder
Every configured model, tiered by price ($input/$output per Mtok). Reference one as provider/id when setting Agent \`model\`.
${ladder}
Tiers are price-derived; where you know a listed model's real capability class, trust your own knowledge over its tier.

## Routing (mode: ${mode} \u2014 switch with /subagent-routing cost|performance)
When you spawn a subagent with Agent(...):
${MODE_RULES[mode] ?? MODE_RULES.cost}
- Hard reasoning, ambiguous specs, or a retry after the ladder is exhausted -> your own model: spawn WITHOUT a \`model\` override, so the subagent inherits the model you are running.
- Never route fan-out to local models (mlx/*); those are for the pil profile.
Run independent implementation subagents with run_in_background: true so they fan out in parallel.

## Judge and escalate
Never accept a subagent result blindly.
1. After it returns, spawn a reviewer subagent (Agent subagent_type: "reviewer") to grade it against the task. Pass no \`model\` so the reviewer inherits your own model, read-only.
2. If the reviewer approves it, accept.
3. If it fails, either fix it yourself or re-spawn the task one tier up, then review again.
Escalation ladder: cheap -> mid -> frontier -> your own model. Ship nothing a reviewer has not passed.
</subagent-routing>`;
}

// subagent-routing/extensions/index.ts
var CONFIG_PATH = join(
  process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"),
  "subagent-routing.json"
);
function loadConfig() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    raw = {};
  }
  return {
    mode: MODES.includes(raw?.mode) ? raw.mode : "cost",
    tiers: typeof raw?.tiers === "object" && raw?.tiers !== null ? raw.tiers : {}
  };
}
function subagentRouting(pi) {
  pi.registerCommand("subagent-routing", {
    description: `Subagent fan-out mode (${MODES.join(" | ")})`,
    handler: async (args, ctx) => {
      const config = loadConfig();
      const next = args?.trim();
      if (!next) {
        ctx.ui.notify(`subagent-routing mode: ${config.mode}`, "info");
        return;
      }
      if (!MODES.includes(next)) {
        ctx.ui.notify(`unknown mode "${next}" \u2014 use ${MODES.join(", ")}`, "error");
        return;
      }
      config.mode = next;
      mkdirSync(dirname(CONFIG_PATH), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
      ctx.ui.notify(`subagent-routing mode: ${next} (applies next turn)`, "info");
    }
  });
  pi.on("before_agent_start", async (event, ctx) => {
    const { mode, tiers } = loadConfig();
    const reg = ctx.modelRegistry;
    const models = reg.getAvailable?.() ?? reg.getAll();
    const selfId = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : void 0;
    const policy = buildPolicy(models, { mode, overrides: tiers, selfId });
    return { systemPrompt: `${event.systemPrompt}

${policy}` };
  });
}
export {
  subagentRouting as default
};
