# session

Identify pi sessions to an aperture proxy.

pi sends no session identifier on LLM requests, so aperture cannot group a
session's calls: each request falls through to a random one-off session and the
sessions view is noise. This extension stamps two headers on every provider
request via pi's `before_provider_headers` hook:

```
X-Pi-Session-Id: 01a0358d-ba61-7b4a-9077-99c5258b25e2
User-Agent: pi/0.83.0 (linux 6.8.0-79-generic; x64; Ubuntu 24.04.3 LTS)
```

`X-Pi-Session-Id` carries the session's UUID (the same one in the session
filename under `~/.pi/agent/sessions/`). aperture hashes it into a stable
`pisn_` session id, so all of a session's calls land in one row. The stock pi
User-Agent on LLM requests is `pi (linux 6.8.0; x64)`, no version and no
distro; this one carries both, and keeps the `pi/` prefix so aperture still
normalizes the agent as Pi.

The headers go to whatever provider the current model points at. Providers can
already correlate your calls by API key, so the marginal exposure is the UUID
itself. If that bothers you, don't install this.

## Install

```
pi install npm:@guygrigsby/pi-session
```

No config. Retries reuse the same headers (the hook fires once per request, not
per attempt).

## Test

```
npm test
```

Covers the User-Agent construction and os-release parsing in
`extensions/session-core.mjs`. The header wiring is exercised by running pi
against aperture and watching a `pisn_` session appear.
