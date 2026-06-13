import { describe, it, expect } from "vitest";
import {
  createTelemetry,
  createNoopTelemetry,
} from "../../src/telemetry/metrics.js";

describe("createNoopTelemetry", () => {
  it("should accept every record call and report an all-zero snapshot", () => {
    const t = createNoopTelemetry();
    // None of these should throw or accumulate.
    t.recordHttpDuration(100);
    t.recordPhaseDuration("research", 200);
    t.recordRunAttempts("refine", 3);
    t.recordRunDuration(900);
    t.recordError("PROVIDER_ERROR", "mock");
    t.recordCheckpointFailure("voice-fidelity");
    t.recordCheckpointScore("voice-fidelity", 0.42);
    t.recordOutcome("published");
    t.recordTokens("build", "mock", 500, 100);
    t.runStarted();
    t.runEnded();

    const snap = t.snapshot();
    expect(snap.http.count).toBe(0);
    expect(snap.tokens.total).toBe(0);
    expect(snap.runsActive).toBe(0);
    expect(snap.errorsByType).toEqual({});
    expect(snap.outcomesByStatus).toEqual({});
  });

  it("should return a span handle whose methods are inert", () => {
    const t = createNoopTelemetry();
    const span = t.startRunSpan("run_1");
    expect(() => {
      const child = span.child("research");
      child.recordException(new Error("x"));
      child.end();
      span.setError("nope");
      span.end();
    }).not.toThrow();
  });
});

describe("createTelemetry (aggregator, OTel disabled / no provider)", () => {
  it("should accumulate histogram stats (avg/p95/min/max) per phase", () => {
    const t = createTelemetry();
    t.recordPhaseDuration("research", 100);
    t.recordPhaseDuration("research", 300);
    t.recordPhaseDuration("research", 200);
    const r = t.snapshot().phaseDurations.research;
    expect(r.count).toBe(3);
    expect(r.avg).toBe(200);
    expect(r.min).toBe(100);
    expect(r.max).toBe(300);
    expect(r.p95).toBe(300);
  });

  it("should count errors by type and checkpoint failures by gate", () => {
    const t = createTelemetry();
    t.recordError("PROVIDER_ERROR", "mock");
    t.recordError("PROVIDER_ERROR", "mock");
    t.recordError("RATE_LIMITED", "claude-opus-4-8");
    t.recordCheckpointFailure("voice-fidelity");
    t.recordCheckpointFailure("quality");
    const snap = t.snapshot();
    expect(snap.errorsByType).toEqual({ PROVIDER_ERROR: 2, RATE_LIMITED: 1 });
    expect(snap.checkpointFailuresByGate).toEqual({
      "voice-fidelity": 1,
      quality: 1,
    });
  });

  it("should track checkpoint score distributions per gate", () => {
    const t = createTelemetry();
    t.recordCheckpointScore("voice-fidelity", 0.4);
    t.recordCheckpointScore("voice-fidelity", 0.8);
    const vf = t.snapshot().checkpointScores["voice-fidelity"];
    expect(vf?.count).toBe(2);
    expect(vf?.avg).toBeCloseTo(0.6, 5);
  });

  it("should sum tokens total + cached and split by phase", () => {
    const t = createTelemetry();
    t.recordTokens("research", "mock", 300, 0);
    t.recordTokens("build", "mock", 500, 120);
    const tok = t.snapshot().tokens;
    expect(tok.total).toBe(800);
    expect(tok.cachedInput).toBe(120);
    expect(tok.byPhase).toEqual({ research: 300, build: 500 });
  });

  it("should track run.attempts and run.duration histograms", () => {
    const t = createTelemetry();
    t.recordRunAttempts("refine", 1);
    t.recordRunAttempts("refine", 2);
    t.recordRunDuration(1200);
    const snap = t.snapshot();
    expect(snap.runAttempts.refine.count).toBe(2);
    expect(snap.runAttempts.refine.avg).toBe(1.5);
    expect(snap.runDuration.count).toBe(1);
    expect(snap.runDuration.avg).toBe(1200);
  });

  it("should track active runs as an up/down gauge that never goes negative", () => {
    const t = createTelemetry();
    t.runStarted();
    t.runStarted();
    expect(t.snapshot().runsActive).toBe(2);
    t.runEnded();
    expect(t.snapshot().runsActive).toBe(1);
    t.runEnded();
    t.runEnded(); // extra end must not go negative
    expect(t.snapshot().runsActive).toBe(0);
  });

  it("should count outcomes by status", () => {
    const t = createTelemetry();
    t.recordOutcome("published");
    t.recordOutcome("failed");
    t.recordOutcome("published");
    expect(t.snapshot().outcomesByStatus).toEqual({ published: 2, failed: 1 });
  });
});
