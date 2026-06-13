import { describe, it, expect } from "vitest";
import { createGuardrailEngine } from "../../src/guardrails/index.js";
import { essayist, operator, sparse } from "../fixtures/personas.js";
import type { Webpage } from "@publisher/shared";

const page: Webpage = {
  title: "Same Concept",
  html:
    "<!doctype html><html><body><h1>Same Concept</h1><p>" +
    "Body text long enough to satisfy the structure length floor comfortably here. ".repeat(
      4,
    ) +
    "</p></body></html>",
  css: "body{font-family:Georgia,serif;max-width:680px;margin:0 auto;}",
  summary: "s",
  sourcesUsed: [],
};

describe("createGuardrailEngine.compile (dp0.3.3 — integration)", () => {
  it("should compile a persona into a systemPrompt + runnable validators", () => {
    const engine = createGuardrailEngine();
    const compiled = engine.compile(essayist);
    expect(typeof compiled.systemPrompt).toBe("string");
    expect(compiled.systemPrompt.length).toBeGreaterThan(0);
    expect(Array.isArray(compiled.validators)).toBe(true);
    expect(compiled.validators.length).toBeGreaterThan(0);

    // validators are callable and return well-formed findings
    const findings = compiled.validators.flatMap((v) => v(page, essayist));
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(typeof f.rule).toBe("string");
      expect(typeof f.passed).toBe("boolean");
    }
  });

  it("should yield TWO DISTINCT systemPrompts for two distinct personas (two-persona proof)", () => {
    const engine = createGuardrailEngine();
    const a = engine.compile(essayist);
    const b = engine.compile(operator);
    expect(a.systemPrompt).not.toBe(b.systemPrompt);
    // The divergence is in the declared design + voice, not incidental
    expect(a.systemPrompt).toContain("serif");
    expect(b.systemPrompt).toContain("sans-serif");
    expect(a.systemPrompt).toContain("The Essayist");
    expect(b.systemPrompt).toContain("The Operator");
  });

  it("should be re-runnable (D19) — recompiling the same persona is deterministic", () => {
    const engine = createGuardrailEngine();
    expect(engine.compile(essayist).systemPrompt).toBe(
      engine.compile(essayist).systemPrompt,
    );
  });

  it("should remain total over a sparse persona (edge case)", () => {
    const engine = createGuardrailEngine();
    const compiled = engine.compile(sparse);
    expect(compiled.systemPrompt).toContain("Bare");
    expect(compiled.validators.length).toBeGreaterThan(0);
  });

  it("should describe validators without serializing the functions", () => {
    const engine = createGuardrailEngine();
    const described = engine.describe(essayist);
    expect(described.validators.length).toBeGreaterThan(0);
    for (const d of described.validators) {
      expect(typeof d.rule).toBe("string");
      expect(typeof d.description).toBe("string");
      // no function leaked into the description payload
      expect(typeof (d as unknown as { fn?: unknown }).fn).toBe("undefined");
    }
    expect(typeof described.systemPrompt).toBe("string");
  });
});
