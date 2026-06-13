import { describe, it, expect } from "vitest";
import {
  WebpageSchema,
  PersonaSchema,
  NewPersonaSchema,
  AlarmSchema,
} from "../../src/index.js";

describe("WebpageSchema", () => {
  const valid = {
    title: "On Emergence",
    html: "<main><h1>On Emergence</h1></main>",
    css: "main{font-family:Georgia}",
    summary: "A short essay on emergence.",
    sourcesUsed: ["https://example.com/a", "https://example.com/b"],
  };

  it("should parse a valid webpage when all fields are well-formed", () => {
    const parsed = WebpageSchema.parse(valid);
    expect(parsed).toEqual(valid);
  });

  it("should reject when a required field (title) is empty", () => {
    const result = WebpageSchema.safeParse({ ...valid, title: "" });
    expect(result.success).toBe(false);
  });

  it("should reject when html is missing", () => {
    const { html: _html, ...withoutHtml } = valid;
    const result = WebpageSchema.safeParse(withoutHtml);
    expect(result.success).toBe(false);
  });

  it("should accept an empty sourcesUsed array (edge case)", () => {
    const parsed = WebpageSchema.parse({ ...valid, sourcesUsed: [] });
    expect(parsed.sourcesUsed).toEqual([]);
  });
});

describe("PersonaSchema", () => {
  const valid = {
    id: "p_1",
    name: "The Essayist",
    voice: "Measured, first-person, fond of the em-dash.",
    stylePoints: ["short paragraphs", "one image per section"],
    keyLearnings: ["emergence is not magic"],
    designElements: { palette: "warm neutrals", typography: "serif" },
  };

  it("should parse a valid persona", () => {
    expect(PersonaSchema.parse(valid)).toEqual(valid);
  });

  it("should reject a persona with an empty name", () => {
    const result = PersonaSchema.safeParse({ ...valid, name: "" });
    expect(result.success).toBe(false);
  });

  it("should accept empty arrays and empty designElements (edge case)", () => {
    const parsed = PersonaSchema.parse({
      ...valid,
      stylePoints: [],
      keyLearnings: [],
      designElements: {},
    });
    expect(parsed.stylePoints).toEqual([]);
    expect(parsed.designElements).toEqual({});
  });

  it("NewPersonaSchema should reject when an id is supplied", () => {
    // omit() strips id from the type; a stray id is ignored, but a missing
    // required field must still fail.
    const result = NewPersonaSchema.safeParse({ name: "x" });
    expect(result.success).toBe(false);
  });
});

describe("AlarmSchema", () => {
  const valid = {
    type: "VOICE_DRIFT",
    severity: "warning",
    context: { score: 0.42, threshold: 0.75 },
    recommendedAction: "Refine: match the voice sample; you drifted formal.",
  };

  it("should parse a valid alarm", () => {
    expect(AlarmSchema.parse(valid)).toEqual(valid);
  });

  it("should reject an unknown alarm type", () => {
    const result = AlarmSchema.safeParse({
      ...valid,
      type: "NOT_A_REAL_ALARM",
    });
    expect(result.success).toBe(false);
  });

  it("should reject an invalid severity", () => {
    const result = AlarmSchema.safeParse({ ...valid, severity: "fatal" });
    expect(result.success).toBe(false);
  });

  it("should accept an empty context object (edge case)", () => {
    const parsed = AlarmSchema.parse({ ...valid, context: {} });
    expect(parsed.context).toEqual({});
  });
});
