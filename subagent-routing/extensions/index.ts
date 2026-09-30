/**
 * subagent-routing - inject the subagent model-routing policy into the system
 * prompt each turn: the orchestrator plans/judges on its own (live) model and
 * fans implementation out per a mode-shaped decision procedure, then reviews
 * before accepting.
 *
 * Every configured, non-local model is a candidate. The ladder is built each
 * turn from the model registry, tiered cheap/mid/frontier by price terciles
 * with optional per-model overrides from <agentDir>/subagent-routing.json:
 *
 *   { "mode": "cost", "tiers": { "kimi-coding/*": "frontier" } }
 *
 * Mode ("cost" | "performance") sets the decision rule, not the menu; switch
 * with /subagent-routing <mode>. Config is re-read every turn, so hand-edits
 * to the tiers map apply on the next turn. The orchestrator/judge model is
 * never named: spawn with no `model` override and the subagent inherits the
 * live one.
 *
 * Two levers:
 *
 * - Pricing fallback (automatic): models the registry prices at zero get
 *   prices from models.dev (Vercel's v1/models when models.dev fails), cached
 *   at <agentDir>/model-pricing.json and refreshed daily between turns.
 * - Jev judge: a `judge` config with apiKey and endpoint registers a `judge`
 *   tool that grades subagent results through Jev instead of a reviewer
 *   subagent. Registration happens at load, so added creds apply next
 *   session; key rotation applies next turn.
 *
 *   { "judge": { "apiKey": "...", "endpoint": "https://.../v4/ai/evaluation-model" } }
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdirSync, readFileSync, statSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Type } from "typebox";
import { MODES, buildPolicy, applyPricing } from "./subagent-routing-core.mjs";
import { fetchPricing, normalizeModelId, pricingStale } from "./pricing.mjs";
import { DEFAULT_JEV_MODEL, evaluate } from "./jev.mjs";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
const CONFIG_PATH = join(AGENT_DIR, "subagent-routing.json");
const PRICING_PATH = join(AGENT_DIR, "model-pricing.json");

interface JudgeConfig {
  apiKey: string;
  endpoint: string;
  model: string;
}

interface Config {
  mode: string;
  tiers: Record<string, string>;
  judge?: JudgeConfig;
  judgeInvalid: boolean;
}

function loadConfig(): Config {
  let raw: any;
  try {
    raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    raw = {}; // missing or malformed config falls through to defaults
  }
  const rawJudge = raw?.judge;
  const judgeValid =
    rawJudge && typeof rawJudge.apiKey === "string" && rawJudge.apiKey !== "" && typeof rawJudge.endpoint === "string";
  return {
    mode: MODES.includes(raw?.mode) ? raw.mode : "cost",
    tiers: typeof raw?.tiers === "object" && raw?.tiers !== null ? raw.tiers : {},
    judge: judgeValid
      ? { apiKey: rawJudge.apiKey, endpoint: rawJudge.endpoint, model: typeof rawJudge.model === "string" ? rawJudge.model : DEFAULT_JEV_MODEL }
      : undefined,
    judgeInvalid: Boolean(rawJudge) && !judgeValid,
  };
}

// Pricing cache, memoized in memory and reloaded only when the file changes.
// Refresh is fire-and-forget between turns: a turn never blocks on the
// network, it uses the cache that exists (possibly none) and kicks a refresh
// when stale.
let pricingMemo: { mtimeMs: number; data: any } = { mtimeMs: -1, data: null };
let pricingRefreshing = false;

function pricingCache(): any {
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(PRICING_PATH).mtimeMs;
  } catch {
    // no cache yet
  }
  if (mtimeMs !== pricingMemo.mtimeMs) {
    try {
      pricingMemo = { mtimeMs, data: JSON.parse(readFileSync(PRICING_PATH, "utf8")) };
    } catch {
      pricingMemo = { mtimeMs, data: null }; // malformed cache: reprice from scratch next refresh
    }
  }
  return pricingMemo.data;
}

function refreshPricingIfStale(): void {
  if (pricingRefreshing || !pricingStale(pricingCache())) return;
  pricingRefreshing = true;
  fetchPricing()
    .then((data) => {
      const tmp = `${PRICING_PATH}.tmp`;
      mkdirSync(dirname(PRICING_PATH), { recursive: true });
      writeFileSync(tmp, JSON.stringify(data));
      renameSync(tmp, PRICING_PATH);
    })
    .catch(() => {
      // Both sources down: keep the stale cache, retry next turn.
    })
    .finally(() => {
      pricingRefreshing = false;
    });
}

export default function subagentRouting(pi: ExtensionAPI): void {
  const judgeAtLoad = loadConfig().judge;
  let warnedInvalidJudge = false;

  if (judgeAtLoad) {
    pi.registerTool({
      name: "judge",
      label: "Jev judge",
      description:
        "Grade a subagent's work with Jev (LLM-as-judge). Pass the task as given to the subagent and the evidence of what changed (file list, git diff, or commit range — not the subagent's summary). Returns pass/fail with a probability. Evidence is truncated to fit the protocol's 24KB request cap.",
      parameters: Type.Object({
        task: Type.String({ description: "The task exactly as handed to the subagent" }),
        evidence: Type.String({ description: "What actually changed: file list, git diff, or commit range" }),
      }),
      async execute(_toolCallId: string, params: { task: string; evidence: string }) {
        const judge = loadConfig().judge; // fresh each call: key rotation applies without a restart
        if (!judge) throw new Error("judge is not configured (subagent-routing.json judge.apiKey + judge.endpoint)");
        const verdict = await evaluate({ ...judge, task: params.task, evidence: params.evidence });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(verdict) }],
          details: verdict,
        };
      },
    });
  }

  pi.registerCommand("subagent-routing", {
    description: `Subagent fan-out mode (${MODES.join(" | ")})`,
    handler: async (args, ctx) => {
      const config = loadConfig();
      const next = args?.trim();
      if (!next) {
        const cache = pricingCache();
        const pricing = cache?.fetchedAt
          ? `${cache.source} ${Math.round((Date.now() - cache.fetchedAt) / 3_600_000)}h ago`
          : "none";
        ctx.ui.notify(
          `subagent-routing mode: ${config.mode} · judge: ${judgeAtLoad ? "jev" : "reviewer subagent"} · pricing: ${pricing}`,
          "info",
        );
        return;
      }
      if (!MODES.includes(next)) {
        ctx.ui.notify(`unknown mode "${next}" — use ${MODES.join(", ")}`, "error");
        return;
      }
      config.mode = next;
      mkdirSync(dirname(CONFIG_PATH), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify({ mode: config.mode, tiers: config.tiers, ...(config.judge ? { judge: config.judge } : {}) }, null, 2) + "\n");
      ctx.ui.notify(`subagent-routing mode: ${next} (applies next turn)`, "info");
    },
  });

  pi.on("before_agent_start", async (event: any, ctx: any) => {
    const { mode, tiers, judgeInvalid } = loadConfig();
    if (judgeInvalid && !warnedInvalidJudge) {
      warnedInvalidJudge = true;
      ctx.ui.notify("subagent-routing: judge config needs apiKey and endpoint; reviewer subagent stays in charge", "warning");
    }
    refreshPricingIfStale();
    const reg = ctx.modelRegistry;
    const models = reg.getAvailable?.() ?? reg.getAll();
    const priced = applyPricing(models, pricingCache()?.prices, normalizeModelId);
    const selfId = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
    const policy = buildPolicy(priced, { mode, overrides: tiers, selfId, judge: Boolean(judgeAtLoad) });
    return { systemPrompt: `${event.systemPrompt}\n\n${policy}` };
  });
}
