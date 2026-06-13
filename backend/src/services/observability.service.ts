import { MetricsSchema, type RunStatus } from "@publisher/shared";
import type { DB } from "../stores/db.js";
import type { RunStore } from "../stores/run.store.js";
import type { MetricStore } from "../stores/metric.store.js";
import type { WebpageStore } from "../stores/webpage.store.js";
import type { TelemetrySnapshot } from "../telemetry/metrics.js";

/**
 * Observability aggregation service (Epic `publisher-2p3`, Pillar 4 read-side).
 *
 * Pure SQLite aggregation over the run/metric/webpage projections, composed —
 * for the admin view only — with the OTel curated snapshot. This layer READS;
 * it adds no instrumentation (the OTel epic owns metering). Token cost and
 * outcome counts come from SQLite; latency/phase-durations/error-counts come
 * from the injected telemetry snapshot (Constitution: single source per metric).
 */

/** One row in the per-article breakdown of a user's publishing. */
export interface ArticleObservability {
  runId: string;
  title: string;
  tokens: number;
  status: RunStatus;
}

/** The per-user snapshot returned by `GET /me/observability`. */
export interface UserObservability {
  /** Total tokens across ALL of the user's runs (published + non-published). */
  totalTokensPublished: number;
  perArticle: ArticleObservability[];
  /** Total research-loop calls across the user's runs. */
  researchLoopCount: number;
  publishedCount: number;
  failedCount: number;
}

/** The admin snapshot returned by `GET /admin/observability`. */
export interface AdminObservability {
  /** Aggregate token totals across every run (all users). */
  tokenTotals: number;
  publishedCount: number;
  /** Runs that ended in `failed` (rejected). */
  rejectedCount: number;
  /** rejectedCount / totalRuns; 0 when there are no runs. */
  rejectedRatio: number;
  /** The OTel curated snapshot (latency, phase durations, errors-by-type, …). */
  telemetry: TelemetrySnapshot;
}

/** Structural deps so the service stays decoupled from concrete stores. */
export interface ObservabilityServiceDeps {
  runStore: RunStore;
  metricStore: MetricStore;
  webpageStore: WebpageStore;
  db: DB;
  /** Reader for the OTel curated snapshot — `telemetry.snapshot` in production,
   * a stub in tests. Injected so the service composes without re-instrumenting. */
  telemetrySnapshot: () => TelemetrySnapshot;
}

export interface ObservabilityService {
  userObservability(userId: string): UserObservability;
  adminObservability(): AdminObservability;
}

/** Per-run rollup folded from the latest metrics snapshot of that run. */
interface RunTokenRollup {
  tokens: number;
  researchCalls: number;
}

/** A minimal header row used by the aggregation queries. */
interface RunHeaderRow {
  id: string;
  status: string;
}

export function createObservabilityService(
  deps: ObservabilityServiceDeps,
): ObservabilityService {
  const { db, runStore, webpageStore, telemetrySnapshot } = deps;

  // The latest metrics snapshot per run (highest created_at, id tie-break),
  // matching MetricStore.listByRun's DESC ordering. Folded into per-run token +
  // research-call totals. We parse the JSON snapshot at the boundary (Rule 2).
  const latestMetricsStmt = db.prepare(
    `SELECT m.run_id AS runId, m.snapshot AS snapshot
       FROM metrics m
       JOIN (
         SELECT run_id, MAX(created_at) AS max_created
           FROM metrics
          GROUP BY run_id
       ) latest
         ON latest.run_id = m.run_id
        AND latest.max_created = m.created_at`,
  );

  /** Fold the latest metrics snapshot of every run into per-run token rollups.
   * Runs with no metrics simply don't appear (treated as zero by callers). */
  function rollupByRun(): Map<string, RunTokenRollup> {
    const rows = latestMetricsStmt.all() as {
      runId: string;
      snapshot: string;
    }[];
    const byRun = new Map<string, RunTokenRollup>();
    for (const row of rows) {
      // Guard against >1 row sharing the same max created_at (same-ms inserts):
      // accumulate is wrong, so keep the first and skip duplicates per run.
      if (byRun.has(row.runId)) continue;
      const m = MetricsSchema.parse(JSON.parse(row.snapshot));
      const tokens =
        m.perPhase.research.tokens +
        m.perPhase.build.tokens +
        m.perPhase.refine.tokens;
      byRun.set(row.runId, { tokens, researchCalls: m.perPhase.research.calls });
    }
    return byRun;
  }

  /** The published webpage title for a run, falling back to the latest attempt. */
  function titleForRun(runId: string, fallback: string): string {
    const pages = webpageStore.listByRun(runId);
    if (pages.length === 0) return fallback;
    const published = pages.find((p) => p.published);
    const chosen = published ?? pages[pages.length - 1];
    return chosen?.webpage.title ?? fallback;
  }

  return {
    userObservability(userId) {
      // Owner-scoped run headers — never reads another user's rows.
      const runs = runStore.list(userId);
      const rollup = rollupByRun();

      let totalTokens = 0;
      let researchLoopCount = 0;
      let publishedCount = 0;
      let failedCount = 0;
      const perArticle: ArticleObservability[] = [];

      for (const run of runs) {
        const r = rollup.get(run.id) ?? { tokens: 0, researchCalls: 0 };
        totalTokens += r.tokens;
        researchLoopCount += r.researchCalls;
        if (run.status === "published") publishedCount += 1;
        if (run.status === "failed") failedCount += 1;
        perArticle.push({
          runId: run.id,
          title: titleForRun(run.id, run.concept),
          tokens: r.tokens,
          status: run.status,
        });
      }

      return {
        totalTokensPublished: totalTokens,
        perArticle,
        researchLoopCount,
        publishedCount,
        failedCount,
      };
    },

    adminObservability() {
      const runs = db
        .prepare(`SELECT id, status FROM runs`)
        .all() as RunHeaderRow[];
      const rollup = rollupByRun();

      let tokenTotals = 0;
      let publishedCount = 0;
      let rejectedCount = 0;
      for (const run of runs) {
        tokenTotals += rollup.get(run.id)?.tokens ?? 0;
        if (run.status === "published") publishedCount += 1;
        if (run.status === "failed") rejectedCount += 1;
      }
      const rejectedRatio =
        runs.length === 0 ? 0 : rejectedCount / runs.length;

      return {
        tokenTotals,
        publishedCount,
        rejectedCount,
        rejectedRatio,
        telemetry: telemetrySnapshot(),
      };
    },
  };
}
