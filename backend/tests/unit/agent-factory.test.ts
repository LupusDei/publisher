import { describe, it, expect, vi } from "vitest";

// Mock the AI SDK so constructing/exercising the real agent never hits the network.
vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({ text: "researched text" })),
  generateObject: vi.fn(async () => ({
    object: {
      title: "T",
      html: "<main>x</main>",
      css: "",
      summary: "s",
      sourcesUsed: [],
    },
  })),
}));

import {
  createAgent,
  MockAgent,
  AnthropicAgent,
} from "../../src/agent/index.js";
import type { Persona } from "@publisher/shared";

const persona: Persona = {
  id: "p_1",
  name: "X",
  voice: "v",
  stylePoints: [],
  keyLearnings: [],
  designElements: {},
};

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

describe("AnthropicAgent (AI SDK mocked)", () => {
  it("research should return the generated text via the SDK", async () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    const result = await agent.research(persona, "concept");
    expect(result.text).toBe("researched text");
    expect(result.sources).toEqual([]);
  });

  it("build should return the structured Webpage object via the SDK", async () => {
    const agent = new AnthropicAgent({ apiKey: "sk-x" });
    const webpage = await agent.build(
      persona,
      { text: "r", sources: [] },
      "be less formal",
    );
    expect(webpage.title).toBe("T");
    expect(webpage.html).toContain("<main>");
  });
});
