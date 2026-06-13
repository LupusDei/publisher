import { describe, it, expect } from "vitest";
import { MaterialSchema, ReceiptSchema } from "../../src/index.js";

const persona = {
  id: "p_1",
  name: "The Essayist",
  voice: "Measured.",
  voiceSample: "I have always believed that emergence is not magic.",
  stylePoints: [],
  keyLearnings: [],
  designElements: {},
};

describe("MaterialSchema", () => {
  const valid = { concept: "On Emergence", persona };

  it("should parse valid material carrying a concept and persona", () => {
    expect(MaterialSchema.parse(valid)).toEqual(valid);
  });

  it("should reject an empty concept (invalid)", () => {
    expect(MaterialSchema.safeParse({ ...valid, concept: "" }).success).toBe(
      false,
    );
  });

  it("should reject material whose persona is malformed (edge case)", () => {
    const result = MaterialSchema.safeParse({
      ...valid,
      persona: { ...persona, name: "" },
    });
    expect(result.success).toBe(false);
  });
});

describe("ReceiptSchema", () => {
  const valid = {
    id: "r_1",
    url: "/published/r_1",
    bytes: 2048,
    publishedAt: "2026-06-13T00:00:00.000Z",
    workerId: "mock",
  };

  it("should parse a valid receipt", () => {
    expect(ReceiptSchema.parse(valid)).toEqual(valid);
  });

  it("should reject a non-integer byte count (invalid)", () => {
    expect(ReceiptSchema.safeParse({ ...valid, bytes: 2.5 }).success).toBe(
      false,
    );
  });

  it("should reject an empty id (edge case)", () => {
    expect(ReceiptSchema.safeParse({ ...valid, id: "" }).success).toBe(false);
  });
});
