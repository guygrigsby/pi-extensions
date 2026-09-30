/**
 * aperture-core - turn Aperture's GET /api/agent-config into pi providers.
 *
 * Aperture renders pi's models.json shape under configs["pi"]: one provider
 * slot per wire protocol (aperture-anthropic, aperture-responses, ...), each
 * with baseUrl/api/apiKey and a models array. Today a model entry is only
 * {id}; unknown extra fields pass through untouched, so fields Aperture adds
 * later (reasoning, contextWindow, ...) reach pi without an extension update.
 */

export const DEFAULT_ENDPOINT = "https://ai.corp.ts.net";

/**
 * apertureEndpoint resolves the Aperture base URL. APERTURE_URL wins, then
 * the baseUrl of an aperture-* provider in pi's models.json, then the
 * default. Aperture's other clients take the URL with /v1 on it, so a
 * trailing /v1 is stripped; agent-config lives at the root.
 */
export function apertureEndpoint(env, modelsJson) {
  const raw = typeof env.APERTURE_URL === "string" ? env.APERTURE_URL.trim() : "";
  return normalize(raw || configuredEndpoint(modelsJson) || DEFAULT_ENDPOINT);
}

function normalize(url) {
  return url.replace(/\/+$/, "").replace(/\/v1$/, "");
}

/** configuredEndpoint returns the first aperture-* provider baseUrl in a parsed models.json, or "". */
function configuredEndpoint(doc) {
  const providers = doc?.providers;
  if (providers == null || typeof providers !== "object") return "";
  for (const [id, p] of Object.entries(providers)) {
    if (id.startsWith("aperture-") && typeof p?.baseUrl === "string" && p.baseUrl.trim()) return p.baseUrl.trim();
  }
  return "";
}

/**
 * fetchPiConfig GETs the agent-config document and returns its pi provider
 * slots. An instance with no pi-reachable models yields []. HTTP and JSON
 * failures throw; callers decide what a failed discovery means.
 */
export async function fetchPiConfig(endpoint, fetchImpl, signal) {
  const url = `${endpoint}/api/agent-config`;
  const res = await fetchImpl(url, { signal });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  const doc = await res.json();
  const pi = doc?.configs?.pi;
  if (pi === undefined || pi === null) return [];
  if (typeof pi !== "string") throw new Error(`GET ${url}: configs.pi is not a string`);
  return providerSlots(JSON.parse(pi));
}

/** providerSlots maps a parsed models.json-shaped document to provider slots. */
export function providerSlots(doc) {
  const providers = doc?.providers;
  if (providers == null || typeof providers !== "object") return [];
  const slots = [];
  for (const [id, p] of Object.entries(providers)) {
    if (p == null || typeof p !== "object") continue;
    if (typeof p.baseUrl !== "string" || typeof p.api !== "string" || !Array.isArray(p.models)) continue;
    slots.push({
      id,
      baseUrl: p.baseUrl,
      api: p.api,
      apiKey: typeof p.apiKey === "string" ? p.apiKey : "not-required",
      models: p.models.filter((m) => m != null && typeof m.id === "string").map(chatModel),
    });
  }
  return slots;
}

/**
 * chatModel fills the fields pi's models.json loader defaults but its
 * extension registration does not: name, input, reasoning, cost,
 * contextWindow, maxTokens. Values Aperture already set win; the rest mirror
 * pi's own models.json defaults so a bare {id} behaves identically either
 * way.
 */
export function chatModel(entry) {
  return {
    reasoning: false,
    ...entry,
    name: entry.name ?? entry.id,
    input: entry.input ?? ["text"],
    cost: entry.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: entry.contextWindow ?? 128000,
    maxTokens: entry.maxTokens ?? 16384,
  };
}
