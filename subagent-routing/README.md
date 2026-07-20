# subagent-routing

Injects a subagent model-routing policy into the system prompt each turn (for
the frontier `pi` profile). The orchestrator plans, specs, and judges on its own
live model, fans implementation out to cheaper cloud subagents by passing an
explicit `model`, and spawns a `reviewer` subagent to grade each result before
accepting it.

Nothing names the orchestrator or judge model: those inherit the live model
(spawn a subagent with no `model` override and it runs on whatever you are
running). Only the cheap fan-out menu is explicit; edit it in
`extensions/subagent-routing-core.mjs` as your available models change.

Pairs with the `active-model` extension (which tells the orchestrator its live
identity) and the global `reviewer` agent type (`~/.pi/agent/agents/reviewer.md`).

No configuration.
