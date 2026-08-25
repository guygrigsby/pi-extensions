/**
 * session — identify pi sessions to an aperture proxy.
 *
 * pi sends no session identifier on LLM requests, so aperture cannot group a
 * session's calls: every request falls through to a random one-off session.
 * This extension stamps two headers on every provider request via the
 * before_provider_headers hook:
 *
 *   X-Pi-Session-Id: <session uuid>   aperture hashes this into a pisn_ session
 *   User-Agent: pi/<version> (<os> <kernel>; <arch>; <distro>)
 *
 * pi's stock LLM User-Agent carries no version and no distro; this one does.
 * The session id goes to whatever provider the model points at. Providers can
 * already correlate your calls by API key, so the marginal exposure is the
 * UUID itself.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { defaultUserAgent } from "./session-core.mjs";

// Resolved once at load: version, kernel and distro don't change mid-session.
const UA = defaultUserAgent(VERSION);

export default function session(pi: ExtensionAPI): void {
	pi.on("before_provider_headers", (event, ctx) => {
		event.headers["X-Pi-Session-Id"] = ctx.sessionManager.getSessionId();
		event.headers["User-Agent"] = UA;
	});
}
