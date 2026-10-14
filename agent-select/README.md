# agent-select

Picks the model for a subagent spawn from pi's live model registry, using [agent-select](https://github.com/guygrigsby/agent-select) (`v0.4.0` or later on `PATH`: `go install github.com/guygrigsby/agent-select/cmd/agent-select@latest`).

Three tools:

- `route_subagent` takes a task kind (`code`, `review`), a mode (`cost` or `quality`), needed capabilities and token estimates. It returns the `provider/id` to spawn, alternatives and why anything was rejected. Given the subagent's `prompt` instead, Jev classifies it and fills whichever of task, needs and token sizes were left out; a prompt that fits none of the taxonomy's tasks still needs `task`.
- `record_subagent_outcome` appends a pass or fail for a model on a task. Only for verdicts a mechanical check decided (tests, build, CI), never the subagent's own report.
- `judge_subagent_outcome` has Jev grade a run no mechanical check covered, from observable evidence (diff, test or command output), and records the verdict only when Jev is sure (p at least 0.8 or at most 0.2). The log marks it with the judging model.

Quality scores come from recorded outcomes once a model has `minRuns` for the task, then from the declared `scores` table. Declare table scores as expected pass rates so the two compare.

The registry reports a zero price for subscription and unpriced models, so zero is treated as unknown, which ranks after every priced model. List providers that really are free (local inference) in `freeProviders`.

Config, `<agentDir>/agent-select.json`, re-read on every call:

```json
{
  "cli": "agent-select",
  "history": "~/.pi/agent/agent-select/outcomes.jsonl",
  "minRuns": 5,
  "freeProviders": ["mlx"],
  "scores": { "anthropic/claude-sonnet-5": { "code": 0.9, "*": 0.8 } },
  "jevUrl": "http://ai/v1/systemone",
  "taxonomy": { "tasks": { "code": "write, fix or change source code" }, "caps": { "image": "reading images" } }
}
```

All keys are optional. `history` defaults to `<agentDir>/agent-select/outcomes.jsonl`, an append-only log you can edit by hand. `jevUrl` is a gateway serving Jev's `/v1/systemone` (Aperture needs no key); without it the CLI uses `TYPESAFE_URL` or `TYPESAFE_API_KEY` from pi's environment. `taxonomy` replaces the default tasks (`code`, `review`, `research`, `docs`) and capabilities (`image`, `reasoning`) Jev chooses between; capability tags must match the registry's.

```
pi install npm:@guygrigsby/pi-agent-select
```
