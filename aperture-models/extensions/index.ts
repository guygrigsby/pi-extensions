/**
 * aperture-models - auto-discover Aperture models.
 *
 * Fetches GET <endpoint>/api/agent-config at load, registers each pi provider
 * slot it renders (aperture-anthropic, aperture-responses, ...), and re-fetches
 * when pi refreshes catalogs (opening /model). Replaces the copy/pasted
 * models.json block from Aperture's setup guide.
 *
 * Endpoint: $APERTURE_URL, else the aperture-* provider baseUrl already in
 * models.json, else https://ai.corp.ts.net.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { apertureEndpoint, fetchPiConfig } from "./aperture-core.mjs";

const BOOT_TIMEOUT_MS = 5000;
const REFRESH_TIMEOUT_MS = 15000;

interface Slot {
  id: string;
  baseUrl: string;
  api: string;
  apiKey: string;
  models: Record<string, unknown>[];
}

export default async function apertureModels(pi: ExtensionAPI): Promise<void> {
  const endpoint = apertureEndpoint(process.env, await modelsJson());

  // discover fetches the agent-config document, deduplicating concurrent
  // calls: pi refreshes every registered provider in one burst, and one
  // document carries them all.
  let inflight: Promise<Slot[]> | null = null;
  const discover = (signal?: AbortSignal): Promise<Slot[]> => {
    inflight ??= fetchPiConfig(endpoint, globalThis.fetch, signal).finally(() => {
      inflight = null;
    });
    return inflight;
  };

  let slots: Slot[] = [];
  let loadError: string | null = null;
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
      api: slot.api as any,
      apiKey: slot.apiKey,
      models: models as any,
      refreshModels: async (context) => {
        if (context.allowNetwork === false) return models as any;
        try {
          const fresh = await discover(
            AbortSignal.any([context.signal, AbortSignal.timeout(REFRESH_TIMEOUT_MS)]),
          );
          // A dropped slot clears the provider; a NEW slot can't register
          // from a refresh, it takes a /reload.
          models = fresh.find((s) => s.id === slot.id)?.models ?? [];
        } catch {
          // Discovery failure keeps the last-known list.
        }
        return models as any;
      },
    });
  }

  pi.on("session_start", async (_event: any, ctx: any) => {
    // Print and JSON modes have no UI, so notify is a no-op there; stderr
    // is the only place a load failure can surface.
    const warn = (msg: string) => (ctx.hasUI ? ctx.ui.notify(msg, "warning") : console.error(`Warning: ${msg}`));
    if (loadError) {
      warn(`aperture-models: discovery failed (${loadError}). Check the tailnet connection and APERTURE_URL, then /reload.`);
    } else if (slots.length === 0) {
      warn(`aperture-models: ${endpoint} serves no pi models.`);
    }
  });
}

/** modelsJson returns pi's parsed models.json, or undefined when absent or unreadable. */
async function modelsJson(): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(getAgentDir(), "models.json"), "utf8"));
  } catch {
    return undefined;
  }
}
