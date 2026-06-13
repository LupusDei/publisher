import { describe, it, expect, vi } from "vitest";

// Mock BOTH SDKs so constructing any real agent never touches the network.
vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({
    text: "researched text",
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
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
    usage: { promptTokens: 5, completionTokens: 15, totalTokens: 20 },
    finishReason: "stop",
  })),
}));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn(() => ({ messages: { create: vi.fn(), parse: vi.fn() } })),
  };
});

import {
  createAgent,
  MockAgent,
  AnthropicAgent,
  AnthropicResearchAgent,
  AVAILABLE_WORKERS,
  resolveWorker,
} from "../../src/agent/index.js";

describe("real-research worker registration (R8/R11, D13)", () => {
  it("should register a third selectable worker: anthropic-research", () => {
    const ids = AVAILABLE_WORKERS.map((w) => w.id);
    expect(ids).toContain("anthropic-research");
  });

  it("should resolve the anthropic-research worker by id", () => {
    const w = resolveWorker("anthropic-research");
    expect(w.id).toBe("anthropic-research");
    expect(w.model).toMatch(/^claude-/);
  });
});

describe("createAgent — selecting the real-research worker", () => {
  it("should keep defaulting to MockAgent when real agent is OFF (createAgent unchanged)", () => {
    const agent = createAgent({
      USE_REAL_AGENT: false,
      ANTHROPIC_API_KEY: "sk-x",
    });
    expect(agent).toBeInstanceOf(MockAgent);
  });

  it("should still return MockAgent when real requested but no key present", () => {
    const agent = createAgent({ USE_REAL_AGENT: true });
    expect(agent).toBeInstanceOf(MockAgent);
  });

  it("should still default to the Vercel-SDK AnthropicAgent (opus) with no workerId", () => {
    const agent = createAgent({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: "sk-x",
    });
    expect(agent).toBeInstanceOf(AnthropicAgent);
    expect(agent.workerId).toBe("opus");
  });

  it("should select AnthropicResearchAgent when workerId is anthropic-research", () => {
    const agent = createAgent({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: "sk-x",
      workerId: "anthropic-research",
    });
    expect(agent).toBeInstanceOf(AnthropicResearchAgent);
    expect(agent.workerId).toBe("anthropic-research");
  });

  it("should keep opus/sonnet on the Vercel-SDK worker (two distinct implementations)", () => {
    const opus = createAgent({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: "sk-x",
      workerId: "opus",
    });
    const research = createAgent({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: "sk-x",
      workerId: "anthropic-research",
    });
    expect(opus).toBeInstanceOf(AnthropicAgent);
    expect(research).toBeInstanceOf(AnthropicResearchAgent);
    expect(opus).not.toBeInstanceOf(AnthropicResearchAgent);
  });
});
