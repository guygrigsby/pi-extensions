// subagent-routing-core - fan-out model ranking and policy text. Pure
// functions over plain {provider, id, cost} entries, so this is unit-testable
// in plain node. index.ts feeds it ctx.modelRegistry.getAvailable().

export const MODES = ["cost", "balance", "performance"];

// Per-Mtok blended rate. Subscription models (kimi-coding) report 0 and rank
// as cheapest, which is honest: they cost nothing per call.
export function costScore(model) {
  const c = model.cost ?? {};
  return (c.input ?? 0) + (c.output ?? 0);
}

// ponytail: mlx is the only local provider; extend if that changes
export function isLocal(model) {
  return model.provider === "mlx";
}

// Pick up to 3 fan-out models for the mode from the configured pool,
// excluding local models and the orchestrator's own model.
// ponytail: cost is the capability proxy for "performance" — the registry
// carries no benchmark data, and expensive correlates with capable.
export function rankModels(models, { mode = "balance", selfId } = {}) {
  const pool = models.filter(
    (m) => !isLocal(m) && `${m.provider}/${m.id}` !== selfId,
  );
  const sorted = [...pool].sort((a, b) => costScore(a) - costScore(b));
  const n = Math.min(3, sorted.length);
  if (mode === "cost") return sorted.slice(0, n);
  if (mode === "performance") return sorted.slice(-n).reverse();
  const start = Math.max(0, Math.floor((sorted.length - n) / 2));
  return sorted.slice(start, start + n);
}

export function buildPolicy(models, { mode = "balance", selfId } = {}) {
  const picks = rankModels(models, { mode, selfId });

  const fanout =
    picks.length === 0
      ? "  No other models are configured; do all work yourself."
      : picks
          .map((m, i) => {
            const price = `$${m.cost?.input ?? 0}/$${m.cost?.output ?? 0} per Mtok`;
            const note = i === 0 ? "  (default fan-out)" : "";
            return `  - ${m.provider}/${m.id}  (${price})${note}`;
          })
          .join("\n");

  return `<subagent-routing>
You are the orchestrator. Plan, spec, and judge yourself; fan implementation out to cheaper subagents and grade their work before accepting it. Your live model is stated in the <active-model> callout in your context; route relative to it (if you are already a cheap or local model, do the work yourself).

## Routing
Fan-out mode: ${mode} (switch with /subagent-routing cost|balance|performance).
When you spawn a subagent with Agent(...):
- Implementation, mechanical edits, well-specified tasks -> set \`model\` to one of these configured models, chosen per task (first entry is the default):
${fanout}
- Hard reasoning, ambiguous specs, or a retry after a failed review -> your own model: spawn WITHOUT a \`model\` override, so the subagent inherits the model you are running.
- Never route fan-out to local models (mlx/*); those are for the pil profile.
Run independent implementation subagents with run_in_background: true so they fan out in parallel.

## Judge and escalate
Never accept a subagent result blindly.
1. After it returns, spawn a reviewer subagent (Agent subagent_type: "reviewer") to grade it against the task. Pass no \`model\` so the reviewer inherits your own model, read-only.
2. If the reviewer approves it, accept.
3. If it fails, either fix it yourself or re-spawn the task WITHOUT a \`model\` override (your own model), then review again.
Escalation ladder: listed fan-out models -> your own model. Ship nothing a reviewer has not passed.
</subagent-routing>`;
}
