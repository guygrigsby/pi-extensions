# subagent-routing

Injects a subagent model-routing policy into the system prompt each turn (for
the frontier `pi` profile). The orchestrator plans, specs, and judges on its own
live model, fans implementation out to other configured models, then spawns a
`reviewer` subagent to grade each result before accepting it.

Every configured, authenticated model is a candidate, minus local (`mlx/*`)
models and the orchestrator's own. The ladder is rebuilt each turn from the
model registry: models are deduped by id across providers (cheapest provider
wins), sorted by price and split into terciles — `cheap`, `mid`, `frontier` —
rendered compactly, one line per provider per tier.

The mode shapes the decision procedure, not the menu:

- `cost` (default) — route each task to the cheapest tier plausibly adequate
  for it; escalate one tier on a failed review; frontier only for genuinely
  hard tasks.
- `performance` — route each task to the tier most likely to pass review first
  try; mechanical work still goes cheap, and the priciest model is never the
  default.

Price is the capability proxy (the registry carries no benchmark data), so the
config takes per-model tier overrides for the models price misplaces — e.g. a
$0 subscription model that is actually frontier-class:

```json
{
  "mode": "cost",
  "tiers": { "kimi-coding/*": "frontier" }
}
```

Keys are `provider/id` exact or `provider/*`; exact beats glob. Config lives at
`<agentDir>/subagent-routing.json` and is re-read every turn, so hand-edits
apply on the next turn. Switch modes with `/subagent-routing cost|performance`.
The policy also licenses the orchestrator to trust its own knowledge of a
model over its price-derived tier.

Nothing names the orchestrator or judge model: those inherit the live model
(spawn a subagent with no `model` override and it runs on whatever you are
running).

Pairs with the `active-model` extension (which tells the orchestrator its live
identity), the global `reviewer` agent type (`~/.pi/agent/agents/reviewer.md`),
and `@tintinweb/pi-subagents` (which provides the `Agent` tool this policy
drives).

## Install

```
pi install npm:@guygrigsby/pi-subagent-routing
```
