import { describe, it, expect } from "vitest";
import type {
  CheckpointContext,
  Persona,
  ResearchResult,
  Webpage,
} from "@publisher/shared";
import {
  researchSufficiency,
  RESEARCH_MIN_SOURCES,
} from "../../src/checkpoints/research-sufficiency.js";
import {
  voiceFidelity,
  VOICE_THRESHOLD,
} from "../../src/checkpoints/voice-fidelity.js";
import {
  designConformance,
  type ValidatorsProvider,
} from "../../src/checkpoints/design-conformance.js";
import { quality, QUALITY_THRESHOLD } from "../../src/checkpoints/quality.js";

const persona: Persona = {
  id: "p_1",
  name: "Ada",
  voice: "precise, warm, technical",
  voiceSample:
    "We build the smallest thing that proves the idea, then we thicken it. Clarity over cleverness, always.",
  stylePoints: ["short sentences", "concrete examples", "no hype"],
  keyLearnings: ["ship the skeleton first"],
  designElements: { tone: "calm" },
};

function page(html: string, summary = "A solid summary of the page."): Webpage {
  return { title: "T", html, css: "", summary, sourcesUsed: [] };
}

function ctx(over: Partial<CheckpointContext> = {}): CheckpointContext {
  const research: ResearchResult = {
    text: "Deep research text.",
    sources: ["https://a.example", "https://b.example", "https://c.example"],
  };
  return {
    persona,
    material: { concept: "On Emergence", persona },
    research,
    webpage: page("<main>We build the smallest thing that proves the idea.</main>"),
    attempt: 1,
    priorResults: [],
    ...over,
  };
}

describe("researchSufficiency (deterministic gate)", () => {
  it("should PASS when source count meets the threshold (happy path)", async () => {
    const r = await researchSufficiency.evaluate(ctx());
    expect(r.passed).toBe(true);
    expect(r.name).toBe("research-sufficiency");
    expect(r.threshold).toBe(RESEARCH_MIN_SOURCES);
    expect(r.score).toBeGreaterThanOrEqual(RESEARCH_MIN_SOURCES);
    expect(r.alarms).toEqual([]);
  });

  it("should FAIL and emit INSUFFICIENT_RESEARCH when too few sources (error path)", async () => {
    const r = await researchSufficiency.evaluate(
      ctx({ research: { text: "thin", sources: ["https://only.example"] } }),
    );
    expect(r.passed).toBe(false);
    expect(r.feedback).toBeTruthy();
    expect(r.alarms.map((a) => a.type)).toContain("INSUFFICIENT_RESEARCH");
    expect(r.alarms[0]?.severity).toBe("warning");
  });

  it("should FAIL on empty sources and not be auto-correctable by refine alone (edge case)", async () => {
    const r = await researchSufficiency.evaluate(
      ctx({ research: { text: "", sources: [] } }),
    );
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.autoCorrectable).toBe(false);
  });
});

describe("voiceFidelity (judge gate)", () => {
  it("should PASS when the judge scores at/above threshold (happy path)", async () => {
    const r = await voiceFidelity({ judge: () => 0.9 }).evaluate(ctx());
    expect(r.passed).toBe(true);
    expect(r.name).toBe("voice-fidelity");
    expect(r.threshold).toBe(VOICE_THRESHOLD);
    expect(r.score).toBe(0.9);
    expect(r.alarms).toEqual([]);
  });

  it("should FAIL with VOICE_DRIFT alarm + feedback when below threshold (error path)", async () => {
    const r = await voiceFidelity({ judge: () => 0.42 }).evaluate(ctx());
    expect(r.passed).toBe(false);
    expect(r.feedback).toBeTruthy();
    expect(r.autoCorrectable).toBe(true);
    expect(r.alarms.map((a) => a.type)).toContain("VOICE_DRIFT");
    expect(r.alarms[0]?.context.score).toBe(0.42);
  });

  it("should FAIL CLOSED with CHECKPOINT_ERROR when the judge throws (fail-closed)", async () => {
    const r = await voiceFidelity({
      judge: () => {
        throw new Error("llm down");
      },
    }).evaluate(ctx());
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.alarms.map((a) => a.type)).toContain("CHECKPOINT_ERROR");
    expect(r.alarms.find((a) => a.type === "CHECKPOINT_ERROR")?.severity).toBe(
      "critical",
    );
  });

  it("should default to the deterministic judge when none is injected", async () => {
    const onVoice = await voiceFidelity().evaluate(
      ctx({
        webpage: page(
          "<main>We build the smallest thing that proves the idea, then we thicken it. Clarity over cleverness.</main>",
        ),
      }),
    );
    const offVoice = await voiceFidelity().evaluate(
      ctx({
        webpage: page(
          "<main>SYNERGY! Leverage disruptive paradigms to maximize stakeholder ROI!!!</main>",
        ),
      }),
    );
    expect(onVoice.passed).toBe(true);
    expect(offVoice.passed).toBe(false);
  });
});

describe("designConformance (validators-provider gate)", () => {
  const allPass: ValidatorsProvider = () => [
    () => [{ rule: "palette", passed: true, detail: "ok" }],
  ];
  const oneFails: ValidatorsProvider = () => [
    () => [{ rule: "palette", passed: true, detail: "ok" }],
    () => [{ rule: "typography", passed: false, detail: "wrong font" }],
  ];

  it("should PASS when all validator findings pass (happy path)", async () => {
    const r = await designConformance({ validators: allPass }).evaluate(ctx());
    expect(r.passed).toBe(true);
    expect(r.name).toBe("design-conformance");
    expect(r.score).toBe(1);
    expect(r.alarms).toEqual([]);
  });

  it("should FAIL with DESIGN_DRIFT + feedback naming the failed rules (error path)", async () => {
    const r = await designConformance({ validators: oneFails }).evaluate(ctx());
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0.5);
    expect(r.feedback).toContain("typography");
    expect(r.autoCorrectable).toBe(true);
    expect(r.alarms.map((a) => a.type)).toContain("DESIGN_DRIFT");
  });

  it("should PASS vacuously (no webpage / no validators) and stay stub-safe (edge case)", async () => {
    const r = await designConformance().evaluate(ctx({ webpage: undefined }));
    expect(r.passed).toBe(true);
    expect(r.details).toMatch(/no (validators|webpage)/i);
  });
});

describe("quality (judge gate)", () => {
  it("should PASS at/above threshold (happy path)", async () => {
    const r = await quality({ judge: () => 0.88 }).evaluate(ctx());
    expect(r.passed).toBe(true);
    expect(r.name).toBe("quality");
    expect(r.threshold).toBe(QUALITY_THRESHOLD);
  });

  it("should FAIL with INSUFFICIENT_QUALITY + feedback below threshold (error path)", async () => {
    const r = await quality({ judge: () => 0.3 }).evaluate(ctx());
    expect(r.passed).toBe(false);
    expect(r.alarms.map((a) => a.type)).toContain("INSUFFICIENT_QUALITY");
    expect(r.feedback).toBeTruthy();
  });

  it("should FAIL CLOSED with CHECKPOINT_ERROR when the judge rejects (fail-closed)", async () => {
    const r = await quality({
      judge: () => Promise.reject(new Error("boom")),
    }).evaluate(ctx());
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.alarms.map((a) => a.type)).toContain("CHECKPOINT_ERROR");
  });
});
