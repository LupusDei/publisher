import { describe, it, expect } from "vitest";
import { WebpageSchema, UsageSchema } from "@publisher/shared";
import { MockAgent } from "../../src/agent/mock-agent.js";

const system =
  'You write in the authentic voice of "The Essayist": warm, plain-spoken, ' +
  "second-person, short sentences.";

async function research(agent: MockAgent) {
  const r = await agent.research({ system, concept: "On Emergence" });
  return r.value;
}

describe("MockAgent scripted drift→pass (R2 money shot, D12)", () => {
  it("attempt 1 (no feedback) should produce deterministic OFF-VOICE content", async () => {
    const agent = new MockAgent();
    const r = await research(agent);
    const first = await agent.build({ system, research: r });

    // Off-voice = overly formal / academic register that ignores the persona.
    expect(first.value.html.toLowerCase()).toContain("furthermore");
    expect(first.value.html).toMatch(/heretofore|aforementioned|pursuant/i);
    // It should NOT carry the on-voice marker.
    expect(first.value.html).not.toContain("data-voice=\"on\"");
    expect(WebpageSchema.parse(first.value)).toBeTruthy();
  });

  it("attempt 1 should be byte-for-byte deterministic across instances", async () => {
    const a = new MockAgent();
    const b = new MockAgent();
    const ra = await research(a);
    const rb = await research(b);
    const fa = await a.build({ system, research: ra });
    const fb = await b.build({ system, research: rb });
    expect(fa.value.html).toEqual(fb.value.html);
    expect(fa.value.title).toEqual(fb.value.title);
  });

  it("any attempt WITH feedback should produce deterministic ON-VOICE content", async () => {
    const agent = new MockAgent();
    const r = await research(agent);
    const refined = await agent.build({
      system,
      research: r,
      feedback: "VOICE_DRIFT: too formal — match the warm second-person sample.",
    });
    // On-voice markers; the formal tells are gone.
    expect(refined.value.html).toContain("data-voice=\"on\"");
    expect(refined.value.html.toLowerCase()).not.toContain("furthermore");
    expect(refined.value.html).not.toMatch(/heretofore|aforementioned|pursuant/i);
    expect(WebpageSchema.parse(refined.value)).toBeTruthy();
  });

  it("the refined draft should be MATERIALLY different from the first (diffable)", async () => {
    const agent = new MockAgent();
    const r = await research(agent);
    const first = await agent.build({ system, research: r });
    const refined = await agent.build({
      system,
      research: r,
      feedback: "less formal",
    });
    expect(refined.value.html).not.toEqual(first.value.html);
    expect(refined.value.title).not.toEqual(first.value.title);
  });

  it("with-feedback content should be deterministic regardless of feedback string", async () => {
    const agent = new MockAgent();
    const r = await research(agent);
    const a = await agent.build({ system, research: r, feedback: "fix the voice" });
    const b = await agent.build({
      system,
      research: r,
      feedback: "completely different feedback text",
    });
    // The drift→pass guarantee is about presence of feedback, not its content.
    expect(a.value.html).toEqual(b.value.html);
  });

  it("both drafts should still populate real-shaped usage and finishReason", async () => {
    const agent = new MockAgent();
    const r = await research(agent);
    const first = await agent.build({ system, research: r });
    const refined = await agent.build({ system, research: r, feedback: "x" });
    for (const draft of [first, refined]) {
      expect(() => UsageSchema.parse(draft.usage)).not.toThrow();
      expect(draft.usage.totalTokens).toBe(
        draft.usage.inputTokens + draft.usage.outputTokens,
      );
      expect(draft.finishReason).toBe("stop");
    }
  });

  it("sourcesUsed should still reflect the research sources in both drafts", async () => {
    const agent = new MockAgent();
    const r = await research(agent);
    const first = await agent.build({ system, research: r });
    const refined = await agent.build({ system, research: r, feedback: "x" });
    expect(first.value.sourcesUsed).toEqual(r.sources);
    expect(refined.value.sourcesUsed).toEqual(r.sources);
  });
});
