# subagent-routing

Injects a subagent model-routing policy into the system prompt each turn (for
the frontier `pi` profile). The orchestrator plans, specs, and judges on its own
live model and fans implementation out to other configured models, then spawns a
`reviewer` subagent to grade each result before accepting it.

The fan-out menu is built each turn from the model registry — every configured,
authenticated model, minus local (`mlx/*`) models and the orchestrator's own —
ranked by the active mode:

- `cost` — the cheapest models (subscription models with $0 rates rank first)
- `balance` — the middle of the price band (default)
- `performance` — the priciest (price as capability proxy; the registry
  carries no benchmark data)

Switch with `/subagent-routing cost|balance|performance` (persisted to
`<agentDir>/subagent-routing.json`, applies next turn).

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
