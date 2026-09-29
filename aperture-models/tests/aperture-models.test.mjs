import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ENDPOINT,
  apertureEndpoint,
  fetchPiConfig,
  providerSlots,
  chatModel,
} from "../extensions/aperture-core.mjs";

// Trimmed capture of GET https://ai.corp.ts.net/api/agent-config.
const AGENT_CONFIG = {
  apertureUrl: "http://ai.corp.ts.net",
  configs: {
    pi: JSON.stringify({
      providers: {
        "aperture-anthropic": {
          baseUrl: "http://ai.corp.ts.net",
          api: "anthropic-messages",
          apiKey: "not-required",
          models: [{ id: "anthropic/claude-fable-5.1" }, { id: "openai/gpt-6-sol" }],
        },
        "aperture-responses": {
          baseUrl: "http://ai.corp.ts.net/v1",
          api: "openai-responses",
          apiKey: "not-required",
          models: [{ id: "openai/gpt-6-sol" }],
        },
      },
    }),
    "pi-mcp": '{"mcpServers":{"aperture":{"url":"http://ai.corp.ts.net/v1/mcp"}}}',
  },
  models: ["anthropic/claude-fable-5.1", "openai/gpt-6-sol"],
};

const stubFetch = (body, status = 200) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("apertureEndpoint defaults to the corp instance and trims trailing slashes", () => {
  assert.equal(apertureEndpoint({}), DEFAULT_ENDPOINT);
  assert.equal(apertureEndpoint({ APERTURE_URL: "  http://bee.tailnet:8080/ " }), "http://bee.tailnet:8080");
  assert.equal(apertureEndpoint({ APERTURE_URL: "" }), DEFAULT_ENDPOINT);
});

test("apertureEndpoint accepts the /v1 base URL other Aperture clients already use", () => {
  assert.equal(
    apertureEndpoint({ APERTURE_URL: "https://megavisor-aperture-1.corp.ts.net/v1" }),
    "https://megavisor-aperture-1.corp.ts.net",
  );
  assert.equal(apertureEndpoint({ APERTURE_URL: "http://bee.tailnet:8080/v1/" }), "http://bee.tailnet:8080");
});

const MODELS_JSON = {
  providers: {
    other: { baseUrl: "http://elsewhere/v1", api: "openai-completions", apiKey: "k" },
    "aperture-responses": { baseUrl: "https://megavisor-aperture-1.corp.ts.net/v1", api: "openai-responses" },
    "aperture-anthropic": { baseUrl: "https://megavisor-aperture-1.corp.ts.net", api: "anthropic-messages" },
  },
};

test("apertureEndpoint takes the aperture provider baseUrl from models.json when the env is unset", () => {
  assert.equal(apertureEndpoint({}, MODELS_JSON), "https://megavisor-aperture-1.corp.ts.net");
  assert.equal(apertureEndpoint({ APERTURE_URL: "" }, MODELS_JSON), "https://megavisor-aperture-1.corp.ts.net");
});

test("apertureEndpoint lets APERTURE_URL override models.json", () => {
  assert.equal(apertureEndpoint({ APERTURE_URL: "http://bee.tailnet:8080/v1" }, MODELS_JSON), "http://bee.tailnet:8080");
});

test("apertureEndpoint falls back to the default when models.json has no aperture provider", () => {
  assert.equal(apertureEndpoint({}, { providers: { other: { baseUrl: "http://elsewhere" } } }), DEFAULT_ENDPOINT);
  assert.equal(apertureEndpoint({}, { providers: { "aperture-x": { baseUrl: 7 } } }), DEFAULT_ENDPOINT);
  assert.equal(apertureEndpoint({}, null), DEFAULT_ENDPOINT);
  assert.equal(apertureEndpoint({}, "garbage"), DEFAULT_ENDPOINT);
});

test("fetchPiConfig parses the pi slot out of the agent-config document", async () => {
  const slots = await fetchPiConfig(DEFAULT_ENDPOINT, stubFetch(AGENT_CONFIG));
  assert.deepEqual(
    slots.map((s) => [s.id, s.api, s.baseUrl, s.apiKey, s.models.length]),
    [
      ["aperture-anthropic", "anthropic-messages", "http://ai.corp.ts.net", "not-required", 2],
      ["aperture-responses", "openai-responses", "http://ai.corp.ts.net/v1", "not-required", 1],
    ],
  );
});

test("fetchPiConfig returns no slots when the instance renders no pi config", async () => {
  assert.deepEqual(await fetchPiConfig(DEFAULT_ENDPOINT, stubFetch({ configs: {} })), []);
  assert.deepEqual(await fetchPiConfig(DEFAULT_ENDPOINT, stubFetch({})), []);
});

test("fetchPiConfig throws on HTTP errors and malformed documents", async () => {
  await assert.rejects(fetchPiConfig(DEFAULT_ENDPOINT, stubFetch({}, 503)), /HTTP 503/);
  await assert.rejects(
    fetchPiConfig(DEFAULT_ENDPOINT, stubFetch({ configs: { pi: "not json" } })),
    /JSON/,
  );
  await assert.rejects(fetchPiConfig(DEFAULT_ENDPOINT, stubFetch({ configs: { pi: 42 } })), /not a string/);
});

test("providerSlots skips malformed slots and models instead of failing discovery", () => {
  const slots = providerSlots({
    providers: {
      good: { baseUrl: "http://x", api: "openai-completions", models: [{ id: "a" }, { noId: true }, null] },
      noBaseUrl: { api: "openai-completions", models: [] },
      noApi: { baseUrl: "http://x", models: [] },
      notAnObject: "nope",
    },
  });
  assert.equal(slots.length, 1);
  assert.deepEqual(slots[0].models.map((m) => m.id), ["a"]);
  assert.deepEqual(providerSlots({}), []);
  assert.deepEqual(providerSlots(null), []);
});

test("providerSlots defaults a missing apiKey to the placeholder pi requires", () => {
  const [slot] = providerSlots({
    providers: { x: { baseUrl: "http://x", api: "openai-completions", models: [] } },
  });
  assert.equal(slot.apiKey, "not-required");
});

test("chatModel mirrors pi's models.json defaults for a bare id entry", () => {
  assert.deepEqual(chatModel({ id: "openai/gpt-6-sol" }), {
    id: "openai/gpt-6-sol",
    name: "openai/gpt-6-sol",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  });
});

test("chatModel passes through fields Aperture sets and keeps explicit values", () => {
  const model = chatModel({
    id: "anthropic/claude-opus-5",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1000000,
    maxTokens: 128000,
    compat: { forceAdaptiveThinking: true },
  });
  assert.equal(model.reasoning, true);
  assert.deepEqual(model.input, ["text", "image"]);
  assert.equal(model.contextWindow, 1000000);
  assert.equal(model.maxTokens, 128000);
  assert.deepEqual(model.compat, { forceAdaptiveThinking: true });
  assert.equal(model.name, "anthropic/claude-opus-5");
});
