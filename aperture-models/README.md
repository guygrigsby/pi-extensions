# aperture-models

Auto-discovers Aperture models. Point pi at an Aperture endpoint and every model it serves you appears in `/model`, replacing the copy/pasted `models.json` block from Aperture's agent setup guide.

On load the extension fetches `GET <endpoint>/api/agent-config`, reads the pi provider slots Aperture renders (one per wire protocol: `aperture-anthropic`, `aperture-responses`, `aperture-completions`, `aperture-gemini`), and registers them. Opening `/model` re-fetches, so models added or removed on the instance show up without a restart. A brand new protocol slot takes a `/reload`.

Discovery failing at load (off the tailnet, wrong endpoint) registers nothing and warns once per session; fix connectivity and `/reload`.

Aperture renders only model ids today, so pi's `models.json` defaults apply (128k context, 16k output, no reasoning flag, zero cost). Extra fields Aperture adds later pass through untouched.

## Config

`APERTURE_URL` sets the endpoint, with or without the `/v1` suffix other Aperture clients use. Default `https://ai.corp.ts.net`.

## Install

```
pi install npm:@guygrigsby/pi-aperture-models
```
