import { describe, it, expect } from "vitest";
import {
  ValidatorFindingSchema,
  type Validator,
  type Webpage,
  type Persona,
} from "../../src/index.js";

describe("ValidatorFindingSchema", () => {
  const valid = {
    rule: "palette-conformance",
    passed: false,
    detail: "Used #ff0000 which is not in the declared palette.",
  };

  it("should parse a valid finding", () => {
    expect(ValidatorFindingSchema.parse(valid)).toEqual(valid);
  });

  it("should reject a finding missing the passed flag (invalid)", () => {
    const { passed: _passed, ...withoutPassed } = valid;
    expect(ValidatorFindingSchema.safeParse(withoutPassed).success).toBe(false);
  });

  it("should accept an empty detail string (edge case)", () => {
    const parsed = ValidatorFindingSchema.parse({ ...valid, detail: "" });
    expect(parsed.detail).toBe("");
  });
});

describe("Validator type", () => {
  it("should structurally accept a function returning findings (compile-time + runtime smoke)", () => {
    const persona = {
      id: "p_1",
      name: "X",
      voice: "v",
      voiceSample: "sample",
      stylePoints: [],
      keyLearnings: [],
      designElements: {},
    } satisfies Persona;
    const page: Webpage = {
      title: "T",
      html: "<main>x</main>",
      css: "",
      summary: "s",
      sourcesUsed: [],
    };
    const v: Validator = (_page, _persona) => [
      { rule: "noop", passed: true, detail: "" },
    ];
    const findings = v(page, persona);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.passed).toBe(true);
  });
});
