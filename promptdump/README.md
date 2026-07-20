# promptdump

See the exact context sent to the model. It captures the provider payload at
`before_provider_request` (the fully assembled system prompt plus messages,
after every per-turn injection such as `claude-memory` and hermes) in memory,
and shows it on demand:

```
/dump-context        folded summary: one line per message, sizes, a preview
/dump-context full   the whole thing expanded
```

Output is a display-only transcript entry, never sent back to the model. If no
request has happened yet in the session, it says so.

Discovered on the frontier `pi` profile, and loaded explicitly on `pil` via
`-e`. No configuration.
