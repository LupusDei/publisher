import { describe, it, expect } from "vitest";
import { createCheckpoints } from "../../src/checkpoints/index.js";

describe("createCheckpoints (ordered registry)", () => {
  it("returns the four gates in canonical order (happy path)", () => {
    const gates = createCheckpoints();
    expect(gates.map((g) => g.name)).toEqual([
      "research-sufficiency",
      "voice-fidelity",
      "design-conformance",
      "quality",
    ]);
  });

  it("tags deterministic vs judge kinds correctly", () => {
    const byName = Object.fromEntries(
      createCheckpoints().map((g) => [g.name, g.kind]),
    );
    expect(byName["research-sufficiency"]).toBe("deterministic");
    expect(byName["design-conformance"]).toBe("deterministic");
    expect(byName["voice-fidelity"]).toBe("judge");
    expect(byName["quality"]).toBe("judge");
  });

  it("threads injected judge + validators deps into the judge/validator gates (edge case)", async () => {
    let validatorsCalled = false;
    const gates = createCheckpoints({
      voiceJudge: () => 0.99,
      qualityJudge: () => 0.99,
      validators: () => {
        validatorsCalled = true;
        return [];
      },
    });
    const ctx = {
      persona: {
        id: "p",
        name: "Ada",
        voice: "v",
        voiceSample: "sample",
        stylePoints: [],
        keyLearnings: [],
        designElements: {},
      },
      material: {
        concept: "c",
        persona: {
          id: "p",
          name: "Ada",
          voice: "v",
          voiceSample: "sample",
          stylePoints: [],
          keyLearnings: [],
          designElements: {},
        },
      },
      research: { text: "t", sources: ["a", "b", "c"] },
      webpage: { title: "T", html: "<main>x</main>", css: "", summary: "s", sourcesUsed: [] },
      attempt: 1,
      priorResults: [],
    };
    const voice = await gates[1]!.evaluate(ctx);
    const design = await gates[2]!.evaluate(ctx);
    expect(voice.score).toBe(0.99);
    expect(validatorsCalled).toBe(true);
    expect(design.passed).toBe(true);
  });
});
