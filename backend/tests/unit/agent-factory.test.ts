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
  createAgentForWorker,
  MockAgent,
  AnthropicAgent,
  AnthropicResearchAgent,
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

// rrt.2.1 — per-run worker selection. The factory resolves a run's workerId to
// the correct concrete Agent + model behind the single `Agent` seam, so a run
// labelled "sonnet" actually builds on claude-sonnet-4-6 (not the cosmetic
// opus default). Real mode off → MockAgent regardless of workerId.
describe("createAgentForWorker (per-run worker selection)", () => {
  const KEY = "sk-x";

  it("should build the opus worker on claude-opus-4-8 (happy path)", () => {
    const agent = createAgentForWorker({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: KEY,
      workerId: "opus",
    });
    expect(agent).toBeInstanceOf(AnthropicAgent);
    expect(agent.workerId).toBe("opus");
    expect(agent.model).toBe("claude-opus-4-8");
  });

  it("should build the sonnet worker on claude-sonnet-4-6 (the swap is real, not cosmetic)", () => {
    const agent = createAgentForWorker({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: KEY,
      workerId: "sonnet",
    });
    expect(agent).toBeInstanceOf(AnthropicAgent);
    expect(agent.workerId).toBe("sonnet");
    expect(agent.model).toBe("claude-sonnet-4-6");
  });

  it("should build the AnthropicResearchAgent for the anthropic-research worker (D13)", () => {
    const agent = createAgentForWorker({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: KEY,
      workerId: "anthropic-research",
    });
    expect(agent).toBeInstanceOf(AnthropicResearchAgent);
    expect(agent.workerId).toBe("anthropic-research");
  });

  it("should degrade an unknown workerId to the default worker (edge case)", () => {
    const agent = createAgentForWorker({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: KEY,
      workerId: "does-not-exist",
    });
    expect(agent).toBeInstanceOf(AnthropicAgent);
    expect(agent.workerId).toBe("opus");
    expect(agent.model).toBe("claude-opus-4-8");
  });

  it("should return MockAgent when real mode is off, regardless of workerId (error/offline path)", () => {
    const agent = createAgentForWorker({
      USE_REAL_AGENT: false,
      ANTHROPIC_API_KEY: KEY,
      workerId: "sonnet",
    });
    expect(agent).toBeInstanceOf(MockAgent);
  });

  it("should return MockAgent when real is requested but no key is present (edge)", () => {
    const agent = createAgentForWorker({
      USE_REAL_AGENT: true,
      workerId: "opus",
    });
    expect(agent).toBeInstanceOf(MockAgent);
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
