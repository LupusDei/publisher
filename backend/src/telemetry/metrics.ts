import {
  metrics,
  trace,
  context,
  SpanStatusCode,
  type Meter,
  type Tracer,
  type Span as OtelSpan,
} from "@opentelemetry/api";
import type { Phase, CheckpointName } from "@publisher/shared";

/**
 * Telemetry module (Pillar 4, system layer). Defines ONE injectable API the run
 * engine and the /admin/telemetry endpoint use, plus a no-op default so CI and
 * unit tests stay deterministic and offline.
 *
 * Design (see specs/003-observability-otel/ADDENDUM-metrics.md):
 *  - The aggregating implementation maintains an in-process snapshot (always)
 *    AND records to OTel instruments obtained from @opentelemetry/api. Those
 *    api instruments are no-ops until otel.ts registers a real provider, so this
 *    module never depends on @opentelemetry/sdk-node and never fails when OTel
 *    is disabled.
 *  - The engine's DEFAULT telemetry is the no-op (zero behavior change, green
 *    tests). The server injects ONE aggregating instance shared by the engine
 *    (writes) and the admin endpoint (reads).
 *
 * Instruments (11): publisher.http.server.duration, publisher.run.phase.duration,
 * publisher.run.duration, publisher.run.attempts, publisher.checkpoint.score
 * (histograms); publisher.agent.errors, publisher.checkpoint.failures,
 * publisher.run.outcomes, publisher.tokens.total, publisher.tokens.cached_input
 * (counters); publisher.runs.active (up-down counter).
 */

export type OutcomeStatus =
  | "published"
  | "failed"
  | "escalated"
  | "awaiting_approval";
export type LoopPhase = "research" | "refine";

export interface HistStat {
  count: number;
  avg: number;
  p95: number;
  min: number;
  max: number;
}

export interface TelemetrySnapshot {
  http: HistStat;
  runDuration: HistStat;
  phaseDurations: Record<Phase, HistStat>;
  runAttempts: Record<LoopPhase, HistStat>;
  checkpointScores: Record<string, HistStat>;
  errorsByType: Record<string, number>;
  checkpointFailuresByGate: Record<string, number>;
  outcomesByStatus: Record<string, number>;
  tokens: {
    total: number;
    cachedInput: number;
    byPhase: Record<string, number>;
  };
  runsActive: number;
}

/** A thin span handle so callers never import the OTel tracer directly. */
export interface Span {
  child(name: string, attrs?: Record<string, string | number>): Span;
  recordException(err: unknown): void;
  setError(message?: string): void;
  end(): void;
}

export interface Telemetry {
  recordHttpDuration(ms: number): void;
  recordPhaseDuration(phase: Phase, ms: number): void;
  recordRunAttempts(phase: LoopPhase, attempts: number): void;
  recordRunDuration(ms: number): void;
  recordError(type: string, workerId: string): void;
  recordCheckpointFailure(gate: CheckpointName): void;
  recordCheckpointScore(gate: CheckpointName, score: number): void;
  recordOutcome(status: OutcomeStatus): void;
  recordTokens(
    phase: Phase,
    workerId: string,
    totalTokens: number,
    cachedInputTokens?: number,
  ): void;
  runStarted(): void;
  runEnded(): void;
  startRunSpan(runId: string, attrs?: Record<string, string | number>): Span;
  snapshot(): TelemetrySnapshot;
}

/* ─────────────────────────── in-process histogram ─────────────────────────── */

const SAMPLE_CAP = 2048;

class Hist {
  private samples: number[] = [];

  record(v: number): void {
    this.samples.push(v);
    if (this.samples.length > SAMPLE_CAP) this.samples.shift();
  }

  stat(): HistStat {
    const n = this.samples.length;
    if (n === 0) return { count: 0, avg: 0, p95: 0, min: 0, max: 0 };
    const sorted = [...this.samples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const idx = Math.min(n - 1, Math.ceil(0.95 * n) - 1);
    return {
      count: n,
      avg: sum / n,
      p95: sorted[idx] ?? 0,
      min: sorted[0] ?? 0,
      max: sorted[n - 1] ?? 0,
    };
  }
}

const ZERO: HistStat = { count: 0, avg: 0, p95: 0, min: 0, max: 0 };

function emptySnapshot(): TelemetrySnapshot {
  return {
    http: { ...ZERO },
    runDuration: { ...ZERO },
    phaseDurations: {
      research: { ...ZERO },
      build: { ...ZERO },
      refine: { ...ZERO },
    },
    runAttempts: { research: { ...ZERO }, refine: { ...ZERO } },
    checkpointScores: {},
    errorsByType: {},
    checkpointFailuresByGate: {},
    outcomesByStatus: {},
    tokens: { total: 0, cachedInput: 0, byPhase: {} },
    runsActive: 0,
  };
}

/* ─────────────────────────────── no-op span ───────────────────────────────── */

const NOOP_SPAN: Span = {
  child: () => NOOP_SPAN,
  recordException: () => {},
  setError: () => {},
  end: () => {},
};

/* ───────────────────────────── no-op telemetry ────────────────────────────── */

/** The default worker for the engine and all unit tests: does nothing, and
 * reports an all-zero snapshot. */
export function createNoopTelemetry(): Telemetry {
  return {
    recordHttpDuration: () => {},
    recordPhaseDuration: () => {},
    recordRunAttempts: () => {},
    recordRunDuration: () => {},
    recordError: () => {},
    recordCheckpointFailure: () => {},
    recordCheckpointScore: () => {},
    recordOutcome: () => {},
    recordTokens: () => {},
    runStarted: () => {},
    runEnded: () => {},
    startRunSpan: () => NOOP_SPAN,
    snapshot: () => emptySnapshot(),
  };
}

/* ──────────────────────────── real OTel span wrap ─────────────────────────── */

function wrapSpan(tracer: Tracer, span: OtelSpan): Span {
  return {
    child(name, attrs) {
      const ctx = trace.setSpan(context.active(), span);
      const c = tracer.startSpan(
        name,
        attrs ? { attributes: attrs } : undefined,
        ctx,
      );
      return wrapSpan(tracer, c);
    },
    recordException(err) {
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      span.setStatus({ code: SpanStatusCode.ERROR });
    },
    setError(message) {
      span.setStatus(
        message
          ? { code: SpanStatusCode.ERROR, message }
          : { code: SpanStatusCode.ERROR },
      );
    },
    end() {
      span.end();
    },
  };
}

/* ─────────────────────────── aggregating telemetry ────────────────────────── */

export interface TelemetryDeps {
  /** OTel meter; defaults to the global api meter (no-op until a provider is registered). */
  meter?: Meter;
  /** OTel tracer; defaults to the global api tracer. */
  tracer?: Tracer;
}

/**
 * The production telemetry: maintains the in-process snapshot AND mirrors every
 * measurement into OTel instruments. Safe to construct with OTel disabled — the
 * api meter/tracer are no-ops until otel.ts registers a provider.
 */
export function createTelemetry(deps: TelemetryDeps = {}): Telemetry {
  const meter = deps.meter ?? metrics.getMeter("publisher");
  const tracer = deps.tracer ?? trace.getTracer("publisher");

  // OTel instruments (no-op until a provider is registered).
  const iHttp = meter.createHistogram("publisher.http.server.duration", {
    unit: "ms",
  });
  const iPhase = meter.createHistogram("publisher.run.phase.duration", {
    unit: "ms",
  });
  const iRunDur = meter.createHistogram("publisher.run.duration", {
    unit: "ms",
  });
  const iAttempts = meter.createHistogram("publisher.run.attempts", {
    unit: "1",
  });
  const iScore = meter.createHistogram("publisher.checkpoint.score", {
    unit: "1",
  });
  const iErrors = meter.createCounter("publisher.agent.errors");
  const iCpFail = meter.createCounter("publisher.checkpoint.failures");
  const iOutcomes = meter.createCounter("publisher.run.outcomes");
  const iTokens = meter.createCounter("publisher.tokens.total");
  const iCached = meter.createCounter("publisher.tokens.cached_input");
  const iActive = meter.createUpDownCounter("publisher.runs.active");

  // In-process aggregator state.
  const httpH = new Hist();
  const runDurH = new Hist();
  const phaseH: Record<Phase, Hist> = {
    research: new Hist(),
    build: new Hist(),
    refine: new Hist(),
  };
  const attemptsH: Record<LoopPhase, Hist> = {
    research: new Hist(),
    refine: new Hist(),
  };
  const scoreH: Record<string, Hist> = {};
  const errorsByType: Record<string, number> = {};
  const cpFailByGate: Record<string, number> = {};
  const outcomesByStatus: Record<string, number> = {};
  const tokensByPhase: Record<string, number> = {};
  let tokensTotal = 0;
  let tokensCached = 0;
  let runsActive = 0;

  const bump = (m: Record<string, number>, k: string, by = 1): void => {
    m[k] = (m[k] ?? 0) + by;
  };

  return {
    recordHttpDuration(ms) {
      httpH.record(ms);
      iHttp.record(ms);
    },
    recordPhaseDuration(phase, ms) {
      phaseH[phase].record(ms);
      iPhase.record(ms, { phase });
    },
    recordRunAttempts(phase, attempts) {
      attemptsH[phase].record(attempts);
      iAttempts.record(attempts, { phase });
    },
    recordRunDuration(ms) {
      runDurH.record(ms);
      iRunDur.record(ms);
    },
    recordError(type, workerId) {
      bump(errorsByType, type);
      iErrors.add(1, { type, workerId });
    },
    recordCheckpointFailure(gate) {
      bump(cpFailByGate, gate);
      iCpFail.add(1, { gate });
    },
    recordCheckpointScore(gate, score) {
      (scoreH[gate] ??= new Hist()).record(score);
      iScore.record(score, { gate });
    },
    recordOutcome(status) {
      bump(outcomesByStatus, status);
      iOutcomes.add(1, { status });
    },
    recordTokens(phase, workerId, totalTokens, cachedInputTokens) {
      tokensTotal += totalTokens;
      bump(tokensByPhase, phase, totalTokens);
      iTokens.add(totalTokens, { phase, workerId });
      if (cachedInputTokens && cachedInputTokens > 0) {
        tokensCached += cachedInputTokens;
        iCached.add(cachedInputTokens, { phase, workerId });
      }
    },
    runStarted() {
      runsActive += 1;
      iActive.add(1);
    },
    runEnded() {
      runsActive = Math.max(0, runsActive - 1);
      iActive.add(-1);
    },
    startRunSpan(runId, attrs) {
      const span = tracer.startSpan("run", {
        attributes: { "publisher.run_id": runId, ...attrs },
      });
      return wrapSpan(tracer, span);
    },
    snapshot() {
      const scores: Record<string, HistStat> = {};
      for (const [gate, h] of Object.entries(scoreH)) scores[gate] = h.stat();
      return {
        http: httpH.stat(),
        runDuration: runDurH.stat(),
        phaseDurations: {
          research: phaseH.research.stat(),
          build: phaseH.build.stat(),
          refine: phaseH.refine.stat(),
        },
        runAttempts: {
          research: attemptsH.research.stat(),
          refine: attemptsH.refine.stat(),
        },
        checkpointScores: scores,
        errorsByType: { ...errorsByType },
        checkpointFailuresByGate: { ...cpFailByGate },
        outcomesByStatus: { ...outcomesByStatus },
        tokens: {
          total: tokensTotal,
          cachedInput: tokensCached,
          byPhase: { ...tokensByPhase },
        },
        runsActive,
      };
    },
  };
}
