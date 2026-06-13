import { describe, it, expect } from "vitest";
import { PersonaSchema } from "../../src/index.js";

const base = {
  id: "p_1",
  name: "The Essayist",
  voice: "Measured, first-person.",
  voiceSample:
    "I have always believed that emergence is not magic — only attention.",
  stylePoints: ["short paragraphs"],
  keyLearnings: ["emergence is not magic"],
  designElements: { palette: "warm neutrals" },
};

describe("PersonaSchema voiceSample", () => {
  it("should parse a persona that includes a voiceSample (valid)", () => {
    expect(PersonaSchema.parse(base).voiceSample).toContain("emergence");
  });

  it("should reject a persona missing voiceSample (invalid)", () => {
    const { voiceSample: _voiceSample, ...withoutSample } = base;
    expect(PersonaSchema.safeParse(withoutSample).success).toBe(false);
  });

  it("should reject a persona whose voiceSample is empty (edge case)", () => {
    expect(PersonaSchema.safeParse({ ...base, voiceSample: "" }).success).toBe(
      false,
    );
  });
});
