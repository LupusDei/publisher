import { describe, it, expect } from "vitest";
import {
  WebpageSchema,
  UsageSchema,
  FinishReasonSchema,
  ResearchResultSchema,
} from "@publisher/shared";
import { MockAgent } from "../../src/agent/mock-agent.js";

const system = 'You write in the authentic voice of "The Essayist".';

describe("MockAgent reconciled seam", () => {
  const agent = new MockAgent();

  it("research should accept { system, concept } and return AgentResult<ResearchResult>", async () => {
    const result = await agent.research({ system, concept: "On Emergence" });
    expect(() => ResearchResultSchema.parse(result.value)).not.toThrow();
    expect(result.value.text).toContain("On Emergence");
    expect(result.value.sources.length).toBeGreaterThan(0);
  });

  it("research should populate real-shaped usage and a finishReason", async () => {
    const result = await agent.research({ system, concept: "On Emergence" });
    expect(() => UsageSchema.parse(result.usage)).not.toThrow();
    expect(result.usage.totalTokens).toBe(
      result.usage.inputTokens + result.usage.outputTokens,
    );
    expect(FinishReasonSchema.parse(result.finishReason)).toBe("stop");
  });

  it("build should accept { system, research, feedback? } and return AgentResult<Webpage>", async () => {
    const research = await agent.research({ system, concept: "On Emergence" });
    const built = await agent.build({ system, research: research.value });
    expect(() => WebpageSchema.parse(built.value)).not.toThrow();
    expect(built.value.sourcesUsed).toEqual(research.value.sources);
    expect(() => UsageSchema.parse(built.usage)).not.toThrow();
    expect(built.finishReason).toBe("stop");
  });

  it("build should produce materially different output when given feedback (R2)", async () => {
    const research = await agent.research({ system, concept: "On Emergence" });
    const first = await agent.build({ system, research: research.value });
    const refined = await agent.build({
      system,
      research: research.value,
      feedback: "match the voice sample; less formal",
    });
    expect(refined.value.html).not.toEqual(first.value.html);
    expect(refined.value.html).toContain("refine:");
  });
});
