import { describe, it, expect } from "vitest";
import {
  EscalationOptionSchema,
  EscalationSchema,
  EscalationDecisionSchema,
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
const alarm = {
  type: "TOKEN_BUDGET_EXCEEDED",
  severity: "critical",
  context: { observed: 6000, limit: 5000 },
  recommendedAction: "Approve anyway or enrich the persona.",
};

describe("EscalationOptionSchema", () => {
  it("should accept every defined option (valid)", () => {
    for (const o of ["enrich_persona", "approve_anyway", "retry", "abort"]) {
      expect(EscalationOptionSchema.parse(o)).toBe(o);
    }
  });

  it("should reject an unknown option (invalid)", () => {
    expect(EscalationOptionSchema.safeParse("ignore").success).toBe(false);
  });
});

describe("EscalationSchema", () => {
  const valid = {
    id: "esc_1",
    runId: "run_1",
    reason: "Token budget exceeded on the build phase.",
    alarm,
    options: ["enrich_persona", "approve_anyway"],
  };

  it("should parse a valid escalation", () => {
    expect(EscalationSchema.parse(valid)).toEqual(valid);
  });

  it("should reject an escalation with an empty options array (edge case)", () => {
    expect(EscalationSchema.safeParse({ ...valid, options: [] }).success).toBe(
      false,
    );
  });

  it("should reject an escalation whose alarm is malformed (invalid)", () => {
    const result = EscalationSchema.safeParse({
      ...valid,
      alarm: { ...alarm, type: "NOT_REAL" },
    });
    expect(result.success).toBe(false);
  });
});

describe("EscalationDecisionSchema", () => {
  it("should parse a decision with no payload (valid)", () => {
    const d = { escalationId: "esc_1", choice: "approve_anyway" };
    expect(EscalationDecisionSchema.parse(d)).toEqual(d);
  });

  it("should parse an enrich decision carrying a persona payload (edge case)", () => {
    const d = {
      escalationId: "esc_1",
      choice: "enrich_persona",
      payload: { persona },
    };
    const parsed = EscalationDecisionSchema.parse(d);
    expect(parsed.payload?.persona?.id).toBe("p_1");
  });

  it("should reject a decision with an unknown choice (invalid)", () => {
    expect(
      EscalationDecisionSchema.safeParse({
        escalationId: "esc_1",
        choice: "panic",
      }).success,
    ).toBe(false);
  });
});
