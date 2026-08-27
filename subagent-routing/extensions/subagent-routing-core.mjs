// subagent-routing-core - fan-out model tiering and policy text. Pure
// functions over plain {provider, id, cost} entries, so this is unit-testable
// in plain node. index.ts feeds it ctx.modelRegistry.getAvailable().

export const MODES = ["cost", "performance"];
export const TIERS = ["cheap", "mid", "frontier"];

// Per-Mtok blended rate. Subscription models (kimi-coding) report 0 and rank
// as cheapest; pin them with a tier override where price lies about them.
export function costScore(model) {
  const c = model.cost ?? {};
  return (c.input ?? 0) + (c.output ?? 0);
}

// ponytail: mlx is the only local provider; extend if that changes
export function isLocal(model) {
  return model.provider === "mlx";
}

// Same model id offered by several providers is one candidate: keep the
// cheapest provider (stable on ties by input order).
function dedupeById(models) {
  const best = new Map();
  for (const m of models) {
    const seen = best.get(m.id);
    if (!seen || costScore(m) < costScore(seen)) best.set(m.id, m);
  }
  return [...best.values()];
}

function overrideFor(model, overrides) {
  const tier = overrides[`${model.provider}/${model.id}`] ?? overrides[`${model.provider}/*`];
  return TIERS.includes(tier) ? tier : undefined;
}

// Tier every configured model: exclude local models and the orchestrator's
// own, dedupe by id, sort by price and split into terciles, then apply config
// overrides (exact `provider/id` beats `provider/*`; unknown tiers ignored).
// Price is the capability proxy — the registry carries no benchmark data —
// so overrides exist to pin the models price misplaces.
export function assignTiers(models, { overrides = {}, selfId } = {}) {
  const pool = dedupeById(
    models.filter((m) => !isLocal(m) && `${m.provider}/${m.id}` !== selfId),
  ).sort((a, b) => costScore(a) - costScore(b));

  const tiers = { cheap: [], mid: [], frontier: [] };
  const c1 = Math.ceil(pool.length / 3);
  const c2 = Math.ceil((2 * pool.length) / 3);
  pool.forEach((m, i) => {
    const tier = overrideFor(m, overrides) ?? (i < c1 ? "cheap" : i < c2 ? "mid" : "frontier");
    tiers[tier].push(m);
  });
  return tiers;
}

// One line per provider per tier: "provider: id ($in/$out), id ($in/$out)".
// Compact on purpose — this is injected every turn and pools run to hundreds.
function tierLines(tierModels) {
  const byProvider = new Map();
  for (const m of tierModels) {
    if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
    byProvider.get(m.provider).push(m);
  }
  return [...byProvider.entries()]
    .map(
      ([provider, ms]) =>
        `- ${provider}: ${ms.map((m) => `${m.id} ($${m.cost?.input ?? 0}/$${m.cost?.output ?? 0})`).join(", ")}`,
    )
    .join("\n");
}

const MODE_RULES = {
  cost: `- Route each task to the cheapest tier plausibly adequate for it; well-specified mechanical work goes to cheap.
- Escalate one tier when a review fails; reach frontier only for genuinely hard tasks.`,
  performance: `- Route each task to the tier you would bet passes review first try: mechanical work still goes cheap, ambiguous specs and hard reasoning start at frontier, and any doubt moves you up a tier.
- Do not default to the priciest model; unnecessary capability is waste, not safety.`,
};

export function buildPolicy(models, { mode = "cost", overrides = {}, selfId } = {}) {
  const tiers = assignTiers(models, { overrides, selfId });
  const total = TIERS.reduce((n, t) => n + tiers[t].length, 0);

  const ladder =
    total === 0
      ? "No other models are configured; do all work yourself."
      : TIERS.filter((t) => tiers[t].length > 0)
          .map((t) => `### ${t}\n${tierLines(tiers[t])}`)
          .join("\n");

  return `<subagent-routing>
You are the orchestrator. Plan, spec, and judge yourself; fan implementation out to subagents and grade their work before accepting it. Your live model is stated in the <active-model> callout in your context; route relative to it (if you are already a cheap or local model, do the work yourself).

## Model ladder
Every configured model, tiered by price ($input/$output per Mtok). Reference one as provider/id when setting Agent \`model\`.
${ladder}
Tiers are price-derived; where you know a listed model's real capability class, trust your own knowledge over its tier.

## Routing (mode: ${mode} — switch with /subagent-routing cost|performance)
When you spawn a subagent with Agent(...):
${MODE_RULES[mode] ?? MODE_RULES.cost}
- Hard reasoning, ambiguous specs, or a retry after the ladder is exhausted -> your own model: spawn WITHOUT a \`model\` override, so the subagent inherits the model you are running.
- Never route fan-out to local models (mlx/*); those are for the pil profile.
Run independent implementation subagents with run_in_background: true so they fan out in parallel.
Always pass a \`maxTurns\` budget: ~15 for mechanical cheap-tier tasks, ~40 for mid, higher only when the task genuinely needs it. A stuck agent must die and escalate, not spin.

## Judge and escalate
Never accept a subagent result blindly: a summary says what the agent intended, not what it did.
1. After it returns, spawn a reviewer subagent (Agent subagent_type: "reviewer") to grade the actual changes against the task. Hand the reviewer the diff itself (file list, \`git diff\`, or commit range), never the worker's self-report. Route the reviewer to mid for mechanical tasks; use your own model (no \`model\` override) only for a dispute, a second failed review, or a security-sensitive diff.
2. If the reviewer approves it, accept.
3. If it fails, either fix it yourself or re-spawn the task one tier up, then review again.
Escalation ladder: cheap -> mid -> frontier -> your own model. Ship nothing a reviewer has not passed. Stop after two failed reviews of the same task and report to the user; do not keep climbing the ladder on your own.
</subagent-routing>`;
}
