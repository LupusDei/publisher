import { describe, it, expect } from "vitest";
import { MetricBreachSchema, type Metrics, type Budget } from "@publisher/shared";
import { detectBreaches } from "../../src/observability/budget.js";

const metrics = (over: Partial<{
  researchTokens: number;
  buildTokens: number;
  refineTokens: number;
  researchLatency: number;
  buildLatency: number;
  refineLatency: number;
  errorRate: number;
}> = {}): Metrics => ({
  perPhase: {
    research: { tokens: over.researchTokens ?? 0, latencyMs: over.researchLatency ?? 0, calls: 1 },
    build: { tokens: over.buildTokens ?? 0, latencyMs: over.buildLatency ?? 0, calls: 1 },
    refine: { tokens: over.refineTokens ?? 0, latencyMs: over.refineLatency ?? 0, calls: 1 },
  },
  errorRate: over.errorRate ?? 0,
});

describe("detectBreaches", () => {
  it("should return no breaches when totals are within budget (happy path)", () => {
    const budget: Budget = { maxTokens: 1000, maxLatencyMs: 5000 };
    const m = metrics({ researchTokens: 100, buildTokens: 200, researchLatency: 1000 });
    expect(detectBreaches(budget, m)).toEqual([]);
  });

  it("should deterministically flag a TOKEN breach when total tokens exceed maxTokens (D12)", () => {
    const budget: Budget = { maxTokens: 500 };
    const m = metrics({ researchTokens: 300, buildTokens: 300, refineTokens: 100 }); // total 700
    const breaches = detectBreaches(budget, m);
    expect(breaches).toHaveLength(1);
    const [b] = breaches;
    expect(b.kind).toBe("token");
    expect(b.observed).toBe(700);
    expect(b.limit).toBe(500);
    expect(b.phase).toBeUndefined(); // aggregate breach, not per-phase
    expect(() => MetricBreachSchema.parse(b)).not.toThrow();
  });

  it("should flag a LATENCY breach when total latency exceeds maxLatencyMs (error path)", () => {
    const budget: Budget = { maxLatencyMs: 1000 };
    const m = metrics({ researchLatency: 600, buildLatency: 600 }); // total 1200
    const breaches = detectBreaches(budget, m);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].kind).toBe("latency");
    expect(breaches[0].observed).toBe(1200);
    expect(breaches[0].limit).toBe(1000);
  });

  it("should flag BOTH token and latency breaches when both limits are exceeded (edge case)", () => {
    const budget: Budget = { maxTokens: 100, maxLatencyMs: 100 };
    const m = metrics({ buildTokens: 500, buildLatency: 500 });
    const breaches = detectBreaches(budget, m);
    expect(breaches.map((b) => b.kind).sort()).toEqual(["latency", "token"]);
  });

  it("should treat an absent budget dimension as unlimited (edge case)", () => {
    const budget: Budget = { maxTokens: 10 }; // no latency limit
    const m = metrics({ buildTokens: 5, buildLatency: 999999 });
    const breaches = detectBreaches(budget, m);
    expect(breaches).toEqual([]); // tokens under limit, latency unbounded
  });

  it("should not flag a breach at exactly the limit (boundary)", () => {
    const budget: Budget = { maxTokens: 500, maxLatencyMs: 500 };
    const m = metrics({ buildTokens: 500, buildLatency: 500 });
    expect(detectBreaches(budget, m)).toEqual([]);
  });

  it("should return no breaches for an empty budget object (edge case)", () => {
    const m = metrics({ buildTokens: 9_999_999, buildLatency: 9_999_999 });
    expect(detectBreaches({}, m)).toEqual([]);
  });
});
