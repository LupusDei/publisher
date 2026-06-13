import { describe, it, expect } from "vitest";
import {
  CheckpointNameSchema,
  CheckpointResultSchema,
  CheckpointContextSchema,
} from "../../src/index.js";

const persona = {
  id: "p_1",
  name: "The Essayist",
  voice: "Measured.",
  voiceSample: "Emergence is not magic.",
  stylePoints: [],
  keyLearnings: [],
  designElements: {},
};
const webpage = {
  title: "T",
  html: "<main>x</main>",
  css: "",
  summary: "s",
  sourcesUsed: [],
};
const alarm = {
  type: "VOICE_DRIFT",
  severity: "warning",
  context: { score: 0.42 },
  recommendedAction: "Refine to match the voice sample.",
};

describe("CheckpointNameSchema", () => {
  it("should accept every defined checkpoint name (valid)", () => {
    for (const n of [
      "research-sufficiency",
      "voice-fidelity",
      "design-conformance",
      "quality",
    ]) {
      expect(CheckpointNameSchema.parse(n)).toBe(n);
    }
  });

  it("should reject an unknown checkpoint name (invalid)", () => {
    expect(CheckpointNameSchema.safeParse("seo").success).toBe(false);
  });
});

describe("CheckpointResultSchema", () => {
  const valid = {
    name: "voice-fidelity",
    passed: false,
    score: 0.42,
    threshold: 0.75,
    details: "Voice drifted formal.",
    autoCorrectable: true,
    feedback: "Match the voice sample; be less formal.",
    alarms: [alarm],
  };

  it("should parse a valid checkpoint result with alarms", () => {
    expect(CheckpointResultSchema.parse(valid)).toEqual(valid);
  });

  it("should parse a passing result with no score/threshold/feedback and empty alarms (edge case)", () => {
    const parsed = CheckpointResultSchema.parse({
      name: "quality",
      passed: true,
      details: "ok",
      autoCorrectable: false,
      alarms: [],
    });
    expect(parsed.alarms).toEqual([]);
    expect(parsed.score).toBeUndefined();
  });

  it("should reject a result missing the alarms array (invalid)", () => {
    const { alarms: _alarms, ...withoutAlarms } = valid;
    expect(CheckpointResultSchema.safeParse(withoutAlarms).success).toBe(false);
  });

  it("should reject a result whose alarm is malformed (invalid)", () => {
    const result = CheckpointResultSchema.safeParse({
      ...valid,
      alarms: [{ ...alarm, severity: "fatal" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("CheckpointContextSchema", () => {
  const valid = {
    persona,
    material: { concept: "On Emergence", persona },
    research: { text: "r", sources: ["https://example.com/a"] },
    webpage,
    attempt: 1,
    priorResults: [],
  };

  it("should parse a valid context with all fields", () => {
    expect(CheckpointContextSchema.parse(valid)).toEqual(valid);
  });

  it("should parse a context without an optional webpage (edge case)", () => {
    const { webpage: _webpage, ...withoutPage } = valid;
    const parsed = CheckpointContextSchema.parse(withoutPage);
    expect(parsed.webpage).toBeUndefined();
  });

  it("should reject a context with a negative attempt (invalid)", () => {
    expect(
      CheckpointContextSchema.safeParse({ ...valid, attempt: -1 }).success,
    ).toBe(false);
  });
});
