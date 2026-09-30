// aperture-models/extensions/index.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// aperture-models/extensions/aperture-core.mjs
var DEFAULT_ENDPOINT = "https://ai.corp.ts.net";
function apertureEndpoint(env, modelsJson2) {
  const raw = typeof env.APERTURE_URL === "string" ? env.APERTURE_URL.trim() : "";
  return normalize(raw || configuredEndpoint(modelsJson2) || DEFAULT_ENDPOINT);
}
function normalize(url) {
  return url.replace(/\/+$/, "").replace(/\/v1$/, "");
}
function configuredEndpoint(doc) {
  const providers = doc?.providers;
  if (providers == null || typeof providers !== "object") return "";
  for (const [id, p] of Object.entries(providers)) {
    if (id.startsWith("aperture-") && typeof p?.baseUrl === "string" && p.baseUrl.trim()) return p.baseUrl.trim();
  }
  return "";
}
async function fetchPiConfig(endpoint, fetchImpl, signal) {
  const url = `${endpoint}/api/agent-config`;
  const res = await fetchImpl(url, { signal });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  const doc = await res.json();
  const pi = doc?.configs?.pi;
  if (pi === void 0 || pi === null) return [];
  if (typeof pi !== "string") throw new Error(`GET ${url}: configs.pi is not a string`);
  return providerSlots(JSON.parse(pi));
}
function providerSlots(doc) {
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
      models: p.models.filter((m) => m != null && typeof m.id === "string").map(chatModel)
    });
  }
  return slots;
}
function chatModel(entry) {
  return {
    reasoning: false,
    ...entry,
    name: entry.name ?? entry.id,
    input: entry.input ?? ["text"],
    cost: entry.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: entry.contextWindow ?? 128e3,
    maxTokens: entry.maxTokens ?? 16384
  };
}

// aperture-models/extensions/index.ts
var BOOT_TIMEOUT_MS = 5e3;
var REFRESH_TIMEOUT_MS = 15e3;
async function apertureModels(pi) {
  const endpoint = apertureEndpoint(process.env, await modelsJson());
  let inflight = null;
  const discover = (signal) => {
    inflight ??= fetchPiConfig(endpoint, globalThis.fetch, signal).finally(() => {
      inflight = null;
    });
    return inflight;
  };
  let slots = [];
  let loadError = null;
  try {
    slots = await discover(AbortSignal.timeout(BOOT_TIMEOUT_MS));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  for (const slot of slots) {
    let models = slot.models;
    pi.registerProvider(slot.id, {
      name: slot.id,
      baseUrl: slot.baseUrl,
      api: slot.api,
      apiKey: slot.apiKey,
      models,
      refreshModels: async (context) => {
        if (context.allowNetwork === false) return models;
        try {
          const fresh = await discover(
            AbortSignal.any([context.signal, AbortSignal.timeout(REFRESH_TIMEOUT_MS)])
          );
          models = fresh.find((s) => s.id === slot.id)?.models ?? [];
        } catch {
        }
        return models;
      }
    });
  }
  pi.on("session_start", async (_event, ctx) => {
    const warn = (msg) => ctx.hasUI ? ctx.ui.notify(msg, "warning") : console.error(`Warning: ${msg}`);
    if (loadError) {
      warn(`aperture-models: discovery failed (${loadError}). Check the tailnet connection and APERTURE_URL, then /reload.`);
    } else if (slots.length === 0) {
      warn(`aperture-models: ${endpoint} serves no pi models.`);
    }
  });
}
async function modelsJson() {
  try {
    return JSON.parse(await readFile(join(getAgentDir(), "models.json"), "utf8"));
  } catch {
    return void 0;
  }
}
export {
  apertureModels as default
};
