# aperture-models

Auto-discovers Aperture models. Point pi at an Aperture endpoint and every model it serves you appears in `/model`, replacing the copy/pasted `models.json` block from Aperture's agent setup guide.

On load the extension fetches `GET <endpoint>/api/agent-config`, reads the pi provider slots Aperture renders (one per wire protocol: `aperture-anthropic`, `aperture-responses`, `aperture-completions`, `aperture-gemini`), and registers them. Opening `/model` re-fetches, so models added or removed on the instance show up without a restart. A brand new protocol slot takes a `/reload`.

Discovery failing at load (off the tailnet, wrong endpoint) registers nothing and warns once per session, on stderr in print mode; fix connectivity and `/reload`.

Aperture renders only model ids today, so pi's `models.json` defaults apply (128k context, 16k output, no reasoning flag, zero cost). Extra fields Aperture adds later pass through untouched.

## Config

`APERTURE_URL` sets the endpoint. Without it, the extension uses the `baseUrl` of an `aperture-*` provider in `models.json`. Without either, the default is `https://ai.corp.ts.net`. A trailing `/v1`, as other Aperture clients use, is accepted.

## Install

```
pi install npm:@guygrigsby/pi-aperture-models
```
