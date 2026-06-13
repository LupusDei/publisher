import { describe, it, expect } from "vitest";
import { RunStatusSchema, RunSchema, RunEventSchema } from "../../src/index.js";

const webpage = {
  title: "T",
  html: "<main>x</main>",
  css: "",
  summary: "s",
  sourcesUsed: [],
};
const receipt = {
  id: "r_1",
  url: "/published/r_1",
  bytes: 100,
  publishedAt: "2026-06-13T00:00:00.000Z",
  workerId: "mock",
};
const envelope = { runId: "run_1", seq: 0, ts: "2026-06-13T00:00:00.000Z" };

describe("RunStatusSchema", () => {
  it("should accept every defined run status (valid)", () => {
    for (const s of [
      "created",
      "researching",
      "building",
      "checking",
      "refining",
      "escalated",
      "published",
      "failed",
    ]) {
      expect(RunStatusSchema.parse(s)).toBe(s);
    }
  });

  it("should reject an unknown status (invalid)", () => {
    expect(RunStatusSchema.safeParse("paused").success).toBe(false);
  });
});

describe("RunSchema", () => {
  const valid = {
    id: "run_1",
    personaId: "p_1",
    concept: "On Emergence",
    workerId: "mock",
    status: "created",
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
  };

  it("should parse a valid run", () => {
    expect(RunSchema.parse(valid)).toEqual(valid);
  });

  it("should reject a run with an unknown status (invalid)", () => {
    expect(RunSchema.safeParse({ ...valid, status: "nope" }).success).toBe(
      false,
    );
  });

  it("should reject a run with an empty concept (edge case)", () => {
    expect(RunSchema.safeParse({ ...valid, concept: "" }).success).toBe(false);
  });
});

describe("RunEventSchema (discriminated union with envelope)", () => {
  it("should parse a phase event", () => {
    const ev = { ...envelope, t: "phase", phase: "research" };
    expect(RunEventSchema.parse(ev)).toEqual(ev);
  });

  it("should parse a draft event (the R2 money shot)", () => {
    const ev = {
      ...envelope,
      seq: 2,
      t: "draft",
      attempt: 1,
      webpage,
      score: 0.42,
      passed: false,
    };
    expect(RunEventSchema.parse(ev)).toEqual(ev);
  });

  it("should parse a published event carrying a receipt", () => {
    const ev = { ...envelope, seq: 9, t: "published", receipt };
    expect(RunEventSchema.parse(ev)).toEqual(ev);
  });

  it("should accept an optional pillar tag (edge case)", () => {
    const ev = {
      ...envelope,
      t: "checkpoint",
      pillar: "checkpoints",
      result: {
        name: "quality",
        passed: true,
        details: "ok",
        autoCorrectable: false,
        alarms: [],
      },
    };
    const parsed = RunEventSchema.parse(ev);
    expect(parsed.pillar).toBe("checkpoints");
  });

  it("should reject an event with an unknown discriminant t (invalid)", () => {
    expect(
      RunEventSchema.safeParse({ ...envelope, t: "exploded" }).success,
    ).toBe(false);
  });

  it("should reject an event missing the seq envelope field (invalid)", () => {
    const { seq: _seq, ...noSeq } = envelope;
    expect(
      RunEventSchema.safeParse({ ...noSeq, t: "phase", phase: "build" })
        .success,
    ).toBe(false);
  });

  it("should reject an unknown pillar tag (edge case)", () => {
    expect(
      RunEventSchema.safeParse({
        ...envelope,
        t: "phase",
        phase: "build",
        pillar: "wizardry",
      }).success,
    ).toBe(false);
  });

  it("should parse a failed event with a reason", () => {
    const ev = { ...envelope, seq: 5, t: "failed", reason: "provider down" };
    expect(RunEventSchema.parse(ev)).toEqual(ev);
  });
});
