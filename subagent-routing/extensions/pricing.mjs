// pricing - fallback model prices when the registry reports none. models.dev
// is the primary source, Vercel's AI Gateway v1/models the fallback. Both are
// distilled to {normalizedId: {input, output}} per Mtok and cached on disk, so
// lookup is one path regardless of source. Pure except fetchPricing and the
// disk functions; inject fetchImpl to test.

export const MODELS_DEV_URL = "https://models.dev/api.json";
export const VERCEL_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";
export const PRICING_TTL_MS = 24 * 60 * 60 * 1000;

// Match by the model's own id, not the provider prefix: pi, models.dev and
// Vercel all spell providers differently for the same model. Case and
// separators differ too ("claude-haiku-4.5" vs "claude-haiku-4-5").
// ponytail: collisions across same-named models are possible; cheapest wins,
// which errs toward the cheap tier the overrides exist to fix.
export function normalizeModelId(id) {
  const tail = String(id ?? "").split("/").pop();
  return tail.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cheaper(a, b) {
  return a.input + a.output <= b.input + b.output ? a : b;
}

// models.dev: {provider: {models: {id: {cost: {input, output}}}}} — per Mtok.
export function distillModelsDev(api) {
  const prices = {};
  for (const provider of Object.values(api ?? {})) {
    for (const [id, model] of Object.entries(provider?.models ?? {})) {
      const cost = model?.cost;
      if (typeof cost?.input !== "number" || typeof cost?.output !== "number") continue;
      const key = normalizeModelId(id);
      const price = { input: cost.input, output: cost.output };
      prices[key] = prices[key] ? cheaper(prices[key], price) : price;
    }
  }
  return prices;
}

// Vercel: {data: [{id, pricing: {input: "0.00000012", output: "..."}}]} —
// strings, per token; convert to per Mtok.
export function distillVercel(api) {
  const prices = {};
  for (const model of api?.data ?? []) {
    const input = parseFloat(model?.pricing?.input);
    const output = parseFloat(model?.pricing?.output);
    if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
    const key = normalizeModelId(model.id);
    const price = { input: input * 1e6, output: output * 1e6 };
    prices[key] = prices[key] ? cheaper(prices[key], price) : price;
  }
  return prices;
}

// Try models.dev, then Vercel. Throws when both fail; the caller keeps the
// stale cache and retries next turn.
export async function fetchPricing({ fetchImpl = fetch, signal } = {}) {
  const sources = [
    { name: "models.dev", url: MODELS_DEV_URL, distill: distillModelsDev },
    { name: "vercel", url: VERCEL_MODELS_URL, distill: distillVercel },
  ];
  let lastError;
  for (const source of sources) {
    try {
      const response = await fetchImpl(source.url, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const prices = source.distill(await response.json());
      if (Object.keys(prices).length === 0) throw new Error("no prices in response");
      return { source: source.name, fetchedAt: Date.now(), prices };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function pricingStale(cache, now = Date.now()) {
  return !cache?.fetchedAt || now - cache.fetchedAt > PRICING_TTL_MS;
}
