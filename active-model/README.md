# active-model

Injects a one-line `<active-model>` call-out into the system prompt each turn,
read live from `ctx.model`. It tells the orchestrator which model it is running
and updates on a mid-session `/model` switch.

Purpose: let orchestration adapt to the live model. When the active model is
strong, fan work out to cheaper subagents; when it is already cheap or local,
do the work directly. Pairs with the `subagent-routing` extension, which reads
this identity when deciding how to route and escalate.

No configuration.

## Install

```
pi install npm:@guygrigsby/pi-active-model
```
