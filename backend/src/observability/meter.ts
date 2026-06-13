import type { Metrics, Phase, Usage } from "@publisher/shared";
import type { Meter } from "../domain/index.js";

/**
 * Per-run Meter (ASSUMPTIONS D9): one instance per `runId`, never a singleton —
 * a shared mutable meter would cross-contaminate overlapping runs. Folds each
 * agent call's `usage.totalTokens` + `latencyMs` into a per-phase rollup, and
 * derives `errorRate` from calls that arrive WITHOUT `usage` (Pillar 4).
 *
 * Why "no usage == error": the frozen `Meter.record` signature carries an
 * optional `usage`. A call that completed normally always reports usage; an
 * errored / faulted call has none to report, so it folds into the error rate
 * while still accruing the wall-clock latency it consumed.
 */
const PHASES: readonly Phase[] = ["research", "build", "refine"];

interface PhaseAccumulator {
  tokens: number;
  latencyMs: number;
  calls: number;
}

export function createMeter(): Meter {
  const perPhase: Record<Phase, PhaseAccumulator> = {
    research: { tokens: 0, latencyMs: 0, calls: 0 },
    build: { tokens: 0, latencyMs: 0, calls: 0 },
    refine: { tokens: 0, latencyMs: 0, calls: 0 },
  };
  let totalCalls = 0;
  let erroredCalls = 0;

  return {
    record(phase: Phase, s: { usage?: Usage; latencyMs: number }): void {
      const acc = perPhase[phase];
      acc.calls += 1;
      acc.latencyMs += s.latencyMs;
      totalCalls += 1;
      if (s.usage) {
        acc.tokens += s.usage.totalTokens;
      } else {
        erroredCalls += 1;
      }
    },

    snapshot(): Metrics {
      return {
        // Copy each accumulator so the returned snapshot is a frozen-in-time
        // value, unaffected by later `record` calls.
        perPhase: {
          research: { ...perPhase.research },
          build: { ...perPhase.build },
          refine: { ...perPhase.refine },
        },
        errorRate: totalCalls === 0 ? 0 : erroredCalls / totalCalls,
      };
    },
  };
}

export { PHASES };
