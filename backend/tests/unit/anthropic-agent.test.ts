import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Deterministic unit tests for the Vercel-AI-SDK worker (`AnthropicAgent`),
 * Worker A behind the `Agent` seam (R8/R11). The `ai` module is MOCKED
 * end-to-end (`vi.mock('ai')`) — no network, no key, never hits the live API
 * in CI (D20). We assert the NEW `ai` v6 call shape:
 *   - `generateText`/`generateObject` receive the compiled `system`, the right
 *     `prompt`, and (for build) the `schema`;
 *   - research bounds steps with `stopWhen: stepCountIs(8)` (NOT the removed
 *     `maxSteps`);
 *   - NO `temperature` is sent (opus-4-8 rejects it);
 *   - the v6 usage shape (`inputTokens`/`outputTokens`/`totalTokens`) maps onto
 *     our `Usage` contract, and `finishReason` maps onto `FinishReason`.
 */

// `stepCountIs` returns an opaque stop-condition; the mock returns a tagged
// sentinel so the test can assert `stopWhen` is exactly `stepCountIs(8)`.
const stepCountIs = vi.fn((n: number) => ({ __stepCountIs: n }));
const generateText = vi.fn();
const generateObject = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  generateObject: (...args: unknown[]) => generateObject(...args),
  stepCountIs: (n: number) => stepCountIs(n),
}));

// The provider factory is mocked so construction needs no key and we can assert
// the model id is wired through.
const languageModel = { __model: "claude-opus-4-8" } as const;
const provider = vi.fn(() => languageModel);
const createAnthropic = vi.fn(() => provider);

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: (...args: unknown[]) => createAnthropic(...args),
}));

import { AnthropicAgent } from "../../src/agent/anthropic-agent.js";

const system = 'You write in the authentic voice of "X".';

/** v6 `generateText` result: usage uses inputTokens/outputTokens/totalTokens. */
function textResult() {
  return {
    text: "the synthesized research narrative",
    usage: { inputTokens: 6000, outputTokens: 900, totalTokens: 6900 },
    finishReason: "stop",
  };
}

/** v6 `generateObject` result. */
function objectResult() {
  return {
    object: {
      title: "Generated Page",
      html: "<main><h1>Generated Page</h1></main>",
      css: "main{max-width:680px}",
      summary: "A page synthesized from research.",
      sourcesUsed: [],
    },
    usage: { inputTokens: 1200, outputTokens: 800, totalTokens: 2000 },
    finishReason: "stop",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateText.mockResolvedValue(textResult());
  generateObject.mockResolvedValue(objectResult());
});

describe("AnthropicAgent — identity", () => {
  it("should expose a stable workerId and default model", () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    expect(agent.workerId).toBe("opus");
    expect(agent.model).toBe("claude-opus-4-8");
    expect(createAnthropic).toHaveBeenCalledWith({ apiKey: "sk-x" });
    expect(provider).toHaveBeenCalledWith("claude-opus-4-8");
  });

  it("should honor an overridden model and workerId", () => {
    const agent = new AnthropicAgent({
      apiKey: "sk-x",
      model: "claude-sonnet-4-6",
      workerId: "sonnet",
    });
    expect(agent.model).toBe("claude-sonnet-4-6");
    expect(agent.workerId).toBe("sonnet");
    expect(provider).toHaveBeenCalledWith("claude-sonnet-4-6");
  });
});

describe("AnthropicAgent.research", () => {
  it("should call generateText with the compiled system and a research prompt", async () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    await agent.research({ system, concept: "the concept" });

    expect(generateText).toHaveBeenCalledTimes(1);
    const body = generateText.mock.calls[0]![0] as {
      model: unknown;
      system: string;
      prompt: string;
    };
    expect(body.model).toBe(languageModel);
    expect(body.system).toBe(system);
    expect(body.prompt).toContain("the concept");
  });

  it("should bound the step count with stopWhen: stepCountIs(8), not maxSteps", async () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    await agent.research({ system, concept: "c" });

    const body = generateText.mock.calls[0]![0] as Record<string, unknown>;
    // The removed v4 knob must be gone.
    expect(body).not.toHaveProperty("maxSteps");
    // The v6 replacement: stopWhen = stepCountIs(8).
    expect(stepCountIs).toHaveBeenCalledWith(8);
    expect(body.stopWhen).toEqual({ __stepCountIs: 8 });
  });

  it("should NOT send a temperature (opus-4-8 rejects it)", async () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    await agent.research({ system, concept: "c" });
    const body = generateText.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("temperature");
  });

  it("should map the v6 usage shape and finishReason into AgentResult", async () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    const result = await agent.research({ system, concept: "c" });
    expect(result.value.text).toBe("the synthesized research narrative");
    expect(result.value.sources).toEqual([]);
    expect(result.usage).toEqual({
      inputTokens: 6000,
      outputTokens: 900,
      totalTokens: 6900,
    });
    expect(result.finishReason).toBe("stop");
  });

  it("should default missing usage fields to zero", async () => {
    generateText.mockResolvedValueOnce({
      text: "t",
      usage: {},
      finishReason: "stop",
    });
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    const result = await agent.research({ system, concept: "c" });
    expect(result.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });

  it("should map a length finishReason through", async () => {
    generateText.mockResolvedValueOnce({
      ...textResult(),
      finishReason: "length",
    });
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    const result = await agent.research({ system, concept: "c" });
    expect(result.finishReason).toBe("length");
  });
});

describe("AnthropicAgent.build", () => {
  const research = { text: "the research narrative", sources: [] };

  it("should call generateObject with the system, schema, and research prompt", async () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    await agent.build({ system, research });

    expect(generateObject).toHaveBeenCalledTimes(1);
    const body = generateObject.mock.calls[0]![0] as {
      model: unknown;
      system: string;
      schema: unknown;
      prompt: string;
    };
    expect(body.model).toBe(languageModel);
    expect(body.system).toBe(system);
    expect(body.schema).toBeDefined();
    expect(body.prompt).toContain("the research narrative");
  });

  it("should include feedback in the prompt on a refine pass", async () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    await agent.build({ system, research, feedback: "be warmer" });
    const body = generateObject.mock.calls[0]![0] as { prompt: string };
    expect(body.prompt).toContain("be warmer");
  });

  it("should NOT send a temperature on build", async () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    await agent.build({ system, research });
    const body = generateObject.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("temperature");
  });

  it("should return the built webpage with usage and finishReason", async () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    const result = await agent.build({ system, research });
    expect(result.value.title).toBe("Generated Page");
    expect(result.value.html).toContain("<main>");
    expect(result.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 800,
      totalTokens: 2000,
    });
    expect(result.finishReason).toBe("stop");
  });
});
