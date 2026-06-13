import { describe, it, expect, vi } from "vitest";

// Mock the AI SDK so constructing/exercising the real agent never hits the net.
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

import {
  createAgent,
  MockAgent,
  AnthropicAgent,
  AVAILABLE_WORKERS,
  BUILDER_WORKERS,
  DEFAULT_WORKER_ID,
  RESEARCH_WORKER_ID,
  resolveWorker,
} from "../../src/agent/index.js";

describe("worker registry (R8/R11)", () => {
  it("should expose at least two selectable workers", () => {
    expect(AVAILABLE_WORKERS.length).toBeGreaterThanOrEqual(2);
  });

  it("should have a stable default worker id present in the registry", () => {
    const ids = AVAILABLE_WORKERS.map((w) => w.id);
    expect(ids).toContain(DEFAULT_WORKER_ID);
  });

  it("each worker should expose id, label and model", () => {
    for (const w of AVAILABLE_WORKERS) {
      expect(typeof w.id).toBe("string");
      expect(typeof w.label).toBe("string");
      expect(typeof w.model).toBe("string");
    }
  });

  it("should expose a distinct second worker (e.g. opus vs sonnet)", () => {
    const models = new Set(AVAILABLE_WORKERS.map((w) => w.model));
    expect(models.size).toBeGreaterThanOrEqual(2);
  });

  it("rrt.6: research worker is the web-research impl, excluded from builders", () => {
    const research = AVAILABLE_WORKERS.find((w) => w.id === RESEARCH_WORKER_ID);
    expect(research?.impl).toBe("anthropic-research");
    // BUILDER_WORKERS are the user-selectable build models — never the research
    // worker, and all backed by the vercel-ai-sdk build impl.
    const builderIds = BUILDER_WORKERS.map((w) => w.id);
    expect(builderIds).not.toContain(RESEARCH_WORKER_ID);
    expect(builderIds).toContain(DEFAULT_WORKER_ID);
    expect(BUILDER_WORKERS.every((w) => w.impl === "vercel-ai-sdk")).toBe(true);
  });
});

describe("resolveWorker", () => {
  it("should resolve a known workerId to its descriptor", () => {
    const w = resolveWorker("sonnet");
    expect(w.id).toBe("sonnet");
  });

  it("should fall back to the default worker for an unknown id", () => {
    const w = resolveWorker("does-not-exist");
    expect(w.id).toBe(DEFAULT_WORKER_ID);
  });

  it("should resolve the default when no id is given", () => {
    const w = resolveWorker(undefined);
    expect(w.id).toBe(DEFAULT_WORKER_ID);
  });
});

describe("createAgent worker selection", () => {
  it("should keep defaulting to MockAgent when real agent is off (createAgent export unchanged)", () => {
    const agent = createAgent({
      USE_REAL_AGENT: false,
      ANTHROPIC_API_KEY: "sk-x",
    });
    expect(agent).toBeInstanceOf(MockAgent);
  });

  it("should return MockAgent when real requested but no key present", () => {
    const agent = createAgent({ USE_REAL_AGENT: true });
    expect(agent).toBeInstanceOf(MockAgent);
  });

  it("should select the default Anthropic worker when enabled with a key", () => {
    const agent = createAgent({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: "sk-x",
    });
    expect(agent).toBeInstanceOf(AnthropicAgent);
  });

  it("should select a SECOND worker by workerId behind the same interface (R11)", () => {
    const opus = createAgent({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: "sk-x",
      workerId: "opus",
    });
    const sonnet = createAgent({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: "sk-x",
      workerId: "sonnet",
    });
    expect(opus).toBeInstanceOf(AnthropicAgent);
    expect(sonnet).toBeInstanceOf(AnthropicAgent);
    // Same interface, different worker identity (the one-line swap).
    expect(opus.workerId).toBe("opus");
    expect(sonnet.workerId).toBe("sonnet");
    expect(opus.model).not.toBe(sonnet.model);
  });

  it("MockAgent should report which worker produced output via workerId", () => {
    const agent = createAgent({ USE_REAL_AGENT: false });
    expect(agent.workerId).toBe("mock");
  });

  it("should ignore an unknown workerId and use the default real worker", () => {
    const agent = createAgent({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: "sk-x",
      workerId: "bogus",
    });
    expect(agent).toBeInstanceOf(AnthropicAgent);
    expect(agent.workerId).toBe(DEFAULT_WORKER_ID);
  });
});
