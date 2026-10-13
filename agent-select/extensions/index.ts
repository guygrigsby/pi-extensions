/**
 * agent-select - rank the live model registry for a subagent spawn.
 *
 * route_subagent turns ctx.modelRegistry into candidates and asks
 * `agent-select rank` for an ordering; the pick is the provider/id to pass
 * as the spawn's model. record_subagent_outcome appends a mechanical
 * verdict to the outcome log, which rank scores from ahead of the
 * operator's table once a model has enough runs for the task.
 *
 * Config: <agentDir>/agent-select.json, re-read per call:
 *   { "cli": "agent-select",                  // binary, default from PATH
 *     "history": "<agentDir>/agent-select/outcomes.jsonl",
 *     "minRuns": 5,
 *     "freeProviders": ["mlx"],               // zero price means free here
 *     "scores": { "anthropic/claude-sonnet-5": { "code": 0.9, "*": 0.8 } } }
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { buildRequest, rank, record, summarize, toCandidates } from "./agent-select-core.mjs";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
const CONFIG_PATH = join(AGENT_DIR, "agent-select.json");

function loadConfig() {
	let raw: any = {};
	try {
		raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
	} catch {
		// no config: defaults
	}
	const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);
	return {
		cli: str(raw.cli, "agent-select"),
		history: str(raw.history, join(AGENT_DIR, "agent-select", "outcomes.jsonl")),
		minRuns: Number.isInteger(raw.minRuns) && raw.minRuns > 0 ? raw.minRuns : 5,
		freeProviders: Array.isArray(raw.freeProviders) ? raw.freeProviders : [],
		scores: raw.scores && typeof raw.scores === "object" ? raw.scores : {},
	};
}

const TASK_DESCRIPTION =
	"Short task kind, reused verbatim when recording the outcome so history accumulates: code, review, research, docs.";

const routeTool = defineTool({
	name: "route_subagent",
	label: "Route subagent",
	description:
		"Pick the model for a subagent spawn from the live model registry. Returns the provider/id to pass as the " +
		"spawn's model, with alternatives to fall back to if it fails. Cost mode takes the cheapest model that fits; " +
		"quality mode takes the best scored, from recorded outcomes first and declared scores second.",
	parameters: Type.Object({
		task: Type.String({ description: TASK_DESCRIPTION }),
		mode: Type.Optional(Type.Union([Type.Literal("cost"), Type.Literal("quality")], { description: "Default cost." })),
		need: Type.Optional(
			Type.Array(Type.String(), { description: 'Capabilities the model must have: "text", "image", "reasoning".' }),
		),
		input_tokens: Type.Optional(Type.Integer({ minimum: 0, description: "Estimated prompt tokens; sizes the context check and cost." })),
		output_tokens: Type.Optional(Type.Integer({ minimum: 0, description: "Estimated output tokens." })),
		max_cost_usd: Type.Optional(Type.Number({ minimum: 0, description: "Reject models estimated above this, or unpriced." })),
	}),
	async execute(_id, params, signal, _onUpdate, ctx) {
		const config = loadConfig();
		const reg = ctx.modelRegistry;
		const models = reg.getAvailable?.() ?? reg.getAll();
		const request = buildRequest(params, toCandidates(models, config), config.scores);
		try {
			const res = await rank({ cli: config.cli, history: config.history, minRuns: config.minRuns, request, signal });
			return { content: [{ type: "text", text: summarize(res) }], details: res };
		} catch (err: any) {
			return { content: [{ type: "text", text: `routing failed: ${err.message}` }], isError: true };
		}
	},
});

const recordTool = defineTool({
	name: "record_subagent_outcome",
	label: "Record subagent outcome",
	description:
		"Record whether a routed subagent's work passed. Only for a verdict a mechanical check decided (tests, build, " +
		"lint, CI) on the subagent's actual changes, never its own report or your impression. Skip it when nothing " +
		"mechanical ran.",
	parameters: Type.Object({
		task: Type.String({ description: "The task passed to route_subagent." }),
		model: Type.String({ description: "provider/id the subagent ran on." }),
		verdict: Type.Union([Type.Literal("pass"), Type.Literal("fail")]),
		check: Type.String({ description: "The mechanical check that decided it, e.g. `make test`." }),
	}),
	async execute(_id, params, signal) {
		const config = loadConfig();
		try {
			mkdirSync(dirname(config.history), { recursive: true });
			await record({ cli: config.cli, history: config.history, task: params.task, model: params.model, verdict: params.verdict, signal });
			return { content: [{ type: "text", text: `recorded ${params.verdict} for ${params.model} on ${params.task} (${params.check})` }] };
		} catch (err: any) {
			return { content: [{ type: "text", text: `record failed: ${err.message}` }], isError: true };
		}
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(routeTool);
	pi.registerTool(recordTool);
}
