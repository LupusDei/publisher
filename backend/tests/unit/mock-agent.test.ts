import { describe, it, expect } from "vitest";
import { WebpageSchema, type Persona } from "@publisher/shared";
import { MockAgent } from "../../src/agent/mock-agent.js";

const persona: Persona = {
  id: "p_1",
  name: "The Essayist",
  voice: "Measured, first-person.",
  stylePoints: ["short paragraphs"],
  keyLearnings: ["emergence is not magic"],
  designElements: { palette: "warm neutrals" },
};

describe("MockAgent", () => {
  const agent = new MockAgent();

  it("research should mention the concept and return sources", async () => {
    const result = await agent.research(persona, "On Emergence");
    expect(result.text).toContain("On Emergence");
    expect(result.sources.length).toBeGreaterThan(0);
  });

  it("build should return an object satisfying the Webpage contract", async () => {
    const research = await agent.research(persona, "On Emergence");
    const webpage = await agent.build(persona, research);
    expect(() => WebpageSchema.parse(webpage)).not.toThrow();
    expect(webpage.sourcesUsed).toEqual(research.sources);
  });

  it("build should produce materially different output when given feedback", async () => {
    const research = await agent.research(persona, "On Emergence");
    const first = await agent.build(persona, research);
    const refined = await agent.build(
      persona,
      research,
      "match the voice sample; less formal",
    );
    expect(refined.html).not.toEqual(first.html);
    expect(refined.html).toContain("refine:");
  });
});
