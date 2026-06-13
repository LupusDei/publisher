import { describe, it, expect } from "vitest";
import { MetricsSchema, type Usage } from "@publisher/shared";
import { createMeter } from "../../src/observability/meter.js";

const usage = (input: number, output: number): Usage => ({
  inputTokens: input,
  outputTokens: output,
  totalTokens: input + output,
});

describe("createMeter", () => {
  it("should accumulate tokens, latency, and calls per phase (happy path)", () => {
    const meter = createMeter();
    meter.record("research", { usage: usage(100, 50), latencyMs: 200 });
    meter.record("research", { usage: usage(20, 30), latencyMs: 100 });
    meter.record("build", { usage: usage(300, 200), latencyMs: 800 });

    const snap = meter.snapshot();
    expect(snap.perPhase.research).toEqual({
      tokens: 200,
      latencyMs: 300,
      calls: 2,
    });
    expect(snap.perPhase.build).toEqual({
      tokens: 500,
      latencyMs: 800,
      calls: 1,
    });
    expect(snap.perPhase.refine).toEqual({
      tokens: 0,
      latencyMs: 0,
      calls: 0,
    });
    // Snapshot conforms to the frozen contract.
    expect(() => MetricsSchema.parse(snap)).not.toThrow();
  });

  it("should treat a usage-less call as an error and fold it into errorRate (error path)", () => {
    const meter = createMeter();
    // One successful call, one errored call (no usage) — error rate = 0.5.
    meter.record("build", { usage: usage(100, 100), latencyMs: 500 });
    meter.record("build", { latencyMs: 50 });

    const snap = meter.snapshot();
    expect(snap.perPhase.build.calls).toBe(2);
    expect(snap.perPhase.build.tokens).toBe(200);
    // Latency still accrues for the failed call (it consumed wall-clock).
    expect(snap.perPhase.build.latencyMs).toBe(550);
    expect(snap.errorRate).toBeCloseTo(0.5);
  });

  it("should return a zeroed snapshot with errorRate 0 before any record (edge case)", () => {
    const meter = createMeter();
    const snap = meter.snapshot();
    expect(snap.errorRate).toBe(0);
    for (const phase of ["research", "build", "refine"] as const) {
      expect(snap.perPhase[phase]).toEqual({
        tokens: 0,
        latencyMs: 0,
        calls: 0,
      });
    }
    expect(() => MetricsSchema.parse(snap)).not.toThrow();
  });

  it("should count cachedInputTokens within totalTokens via the usage total (edge case)", () => {
    const meter = createMeter();
    meter.record("refine", {
      usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100, cachedInputTokens: 40 },
      latencyMs: 120,
    });
    const snap = meter.snapshot();
    // Meter folds the reported totalTokens; it does not re-derive from parts.
    expect(snap.perPhase.refine.tokens).toBe(100);
  });

  it("should isolate two meters so concurrent runs do not cross-contaminate (D9)", () => {
    const a = createMeter();
    const b = createMeter();
    a.record("research", { usage: usage(100, 0), latencyMs: 10 });
    b.record("research", { usage: usage(5, 0), latencyMs: 1 });
    expect(a.snapshot().perPhase.research.tokens).toBe(100);
    expect(b.snapshot().perPhase.research.tokens).toBe(5);
  });

  it("should return an independent snapshot that does not mutate when the meter records more (edge case)", () => {
    const meter = createMeter();
    meter.record("research", { usage: usage(10, 0), latencyMs: 5 });
    const first = meter.snapshot();
    meter.record("research", { usage: usage(90, 0), latencyMs: 5 });
    // The earlier snapshot must be a frozen copy, unaffected by later records.
    expect(first.perPhase.research.tokens).toBe(10);
    expect(meter.snapshot().perPhase.research.tokens).toBe(100);
  });
});
