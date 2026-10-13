# agent-select

Picks the model for a subagent spawn from pi's live model registry, using [agent-select](https://github.com/guygrigsby/agent-select) (`v0.3.0` or later on `PATH`: `go install github.com/guygrigsby/agent-select/cmd/agent-select@latest`).

Two tools:

- `route_subagent` takes a task kind (`code`, `review`), a mode (`cost` or `quality`), needed capabilities and token estimates. It returns the `provider/id` to spawn, alternatives and why anything was rejected.
- `record_subagent_outcome` appends a pass or fail for a model on a task. Only for verdicts a mechanical check decided (tests, build, CI), never the subagent's own report.

Quality scores come from recorded outcomes once a model has `minRuns` for the task, then from the declared `scores` table. Declare table scores as expected pass rates so the two compare.

The registry reports a zero price for subscription and unpriced models, so zero is treated as unknown, which ranks after every priced model. List providers that really are free (local inference) in `freeProviders`.

Config, `<agentDir>/agent-select.json`, re-read on every call:

```json
{
  "cli": "agent-select",
  "history": "~/.pi/agent/agent-select/outcomes.jsonl",
  "minRuns": 5,
  "freeProviders": ["mlx"],
  "scores": { "anthropic/claude-sonnet-5": { "code": 0.9, "*": 0.8 } }
}
```

All keys are optional. `history` defaults to `<agentDir>/agent-select/outcomes.jsonl`, an append-only log you can edit by hand.

```
pi install npm:@guygrigsby/pi-agent-select
```
