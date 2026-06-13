import { describe, it, expect } from "vitest";
import { compilePersonaSystem } from "../../src/guardrails/compile.js";
import { essayist, operator, sparse } from "../fixtures/personas.js";
import type { Persona } from "@publisher/shared";

describe("compilePersonaSystem (enriched preventive compile — dp0.3.1)", () => {
  it("should incorporate voice, style points, key learnings, voiceSample exemplar, and design tokens", () => {
    const out = compilePersonaSystem(essayist);

    // Identity + voice
    expect(out).toContain("The Essayist");
    expect(out).toContain(essayist.voice);

    // voiceSample presented as an exemplar block to imitate (framed, not raw echo)
    expect(out).toMatch(/EXEMPLAR|exemplar/);
    expect(out).toContain(essayist.voiceSample);

    // style points enumerated under a clear header, as a bulleted list
    expect(out).toMatch(/Style points/i);
    for (const sp of essayist.stylePoints) expect(out).toContain(`- ${sp}`);

    // key learnings enumerated under a clear header
    expect(out).toMatch(/Key learnings/i);
    for (const kl of essayist.keyLearnings) expect(out).toContain(`- ${kl}`);

    // design tokens labelled by the fixed vocabulary key under a Design system header
    expect(out).toMatch(/Design system/i);
    expect(out).toContain("palette");
    expect(out).toContain("warm neutrals");
    expect(out).toContain("typography");
    expect(out).toContain("serif");
    expect(out).toContain("layout");
    expect(out).toContain("tone");
  });

  it("should be deterministic — identical input yields byte-identical output", () => {
    expect(compilePersonaSystem(essayist)).toBe(compilePersonaSystem(essayist));
    expect(compilePersonaSystem(operator)).toBe(compilePersonaSystem(operator));
  });

  it("should produce DISTINCT prompts for distinct personas (two-persona proof)", () => {
    const a = compilePersonaSystem(essayist);
    const b = compilePersonaSystem(operator);
    expect(a).not.toBe(b);
    // Each carries its own design vocabulary values
    expect(a).toContain("serif");
    expect(b).toContain("sans-serif");
    expect(a).not.toContain("dense-grid");
    expect(b).toContain("dense-grid");
  });

  it("should omit empty optional sections for a sparse persona (edge case) but keep identity + sample", () => {
    const out = compilePersonaSystem(sparse);
    expect(out).toContain('"Bare"');
    expect(out).toContain("a single sample line");
    // No empty headers leak through
    expect(out).not.toMatch(/Style points/i);
    expect(out).not.toMatch(/Key learnings/i);
    expect(out).not.toMatch(/Design system/i);
    // No dangling "Voice:" label when voice is empty
    expect(out).not.toMatch(/^Voice:\s*$/m);
  });

  it("should remain total — never throw — over a minimal persona", () => {
    const minimal: Persona = {
      id: "x",
      name: "X",
      voice: "",
      voiceSample: "s",
      stylePoints: [],
      keyLearnings: [],
      designElements: {},
    };
    expect(() => compilePersonaSystem(minimal)).not.toThrow();
    expect(compilePersonaSystem(minimal)).toContain("X");
  });
});
