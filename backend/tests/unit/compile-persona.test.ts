import { describe, it, expect } from "vitest";
import { compilePersonaSystem } from "../../src/guardrails/compile.js";
import type { Persona } from "@publisher/shared";

describe("compilePersonaSystem", () => {
  it("should include every declared persona facet when populated", () => {
    const persona: Persona = {
      id: "p_1",
      name: "The Essayist",
      voice: "Measured, first-person.",
      voiceSample: "Emergence is not magic — only attention.",
      stylePoints: ["short paragraphs", "one image per section"],
      keyLearnings: ["emergence is not magic"],
      designElements: { palette: "warm neutrals", typography: "serif" },
    };
    const out = compilePersonaSystem(persona);
    expect(out).toContain("The Essayist");
    expect(out).toContain("Voice: Measured");
    expect(out).toContain("Voice sample to match: Emergence is not magic");
    expect(out).toContain(
      "Style points: short paragraphs; one image per section",
    );
    expect(out).toContain("Key learnings to draw on: emergence is not magic");
    expect(out).toContain("palette=warm neutrals");
  });

  it("should omit empty optional sections for a thin persona (edge case)", () => {
    const thin: Persona = {
      id: "p_2",
      name: "Bare",
      voice: "",
      voiceSample: "a sample",
      stylePoints: [],
      keyLearnings: [],
      designElements: {},
    };
    const out = compilePersonaSystem(thin);
    expect(out).toContain('You write in the authentic voice of "Bare".');
    expect(out).toContain("Voice sample to match: a sample");
    expect(out).not.toContain("Style points");
    expect(out).not.toContain("Design elements");
  });
});
