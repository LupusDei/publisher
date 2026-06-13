import { describe, it, expect, vi } from "vitest";

// Mock the AI SDK so constructing/exercising the real agent never hits the
// network. Usage uses the ai@^6 shape (inputTokens/outputTokens/totalTokens),
// and `stepCountIs` must be provided since research() now bounds steps with
// `stopWhen: stepCountIs(8)` (the v4 `maxSteps` was removed).
vi.mock("ai", () => ({
  stepCountIs: vi.fn((n: number) => ({ __stepCountIs: n })),
  generateText: vi.fn(async () => ({
    text: "researched text",
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    finishReason: "stop",
  })),
  generateObject: vi.fn(async () => ({
    object: {
      title: "T",
      html: "<main>x</main>",
      css: "",
      summary: "s",
      sourcesUsed: [],
    },
    usage: { inputTokens: 5, outputTokens: 15, totalTokens: 20 },
    finishReason: "stop",
  })),
}));

import {
  createAgent,
  MockAgent,
  AnthropicAgent,
} from "../../src/agent/index.js";

describe("createAgent factory", () => {
  it("should default to MockAgent when USE_REAL_AGENT is false", () => {
    const agent = createAgent({
      USE_REAL_AGENT: false,
      ANTHROPIC_API_KEY: "sk-x",
    });
    expect(agent).toBeInstanceOf(MockAgent);
  });

  it("should return MockAgent when real is requested but no key is present", () => {
    const agent = createAgent({ USE_REAL_AGENT: true });
    expect(agent).toBeInstanceOf(MockAgent);
  });

  it("should return AnthropicAgent when enabled with a key", () => {
    const agent = createAgent({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: "sk-x",
    });
    expect(agent).toBeInstanceOf(AnthropicAgent);
  });
});

describe("AnthropicAgent (AI SDK mocked) — contract-shape only (D20)", () => {
  const system = 'You write in the authentic voice of "X".';

  it("research should return an AgentResult with text, usage and finishReason", async () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    const result = await agent.research({ system, concept: "concept" });
    expect(result.value.text).toBe("researched text");
    expect(result.value.sources).toEqual([]);
    expect(result.usage.totalTokens).toBe(30);
    expect(result.finishReason).toBe("stop");
  });

  it("build should return an AgentResult wrapping the structured Webpage", async () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    const result = await agent.build({
      system,
      research: { text: "r", sources: [] },
      feedback: "be less formal",
    });
    expect(result.value.title).toBe("T");
    expect(result.value.html).toContain("<main>");
    expect(result.usage.totalTokens).toBe(20);
    expect(result.finishReason).toBe("stop");
  });
});
