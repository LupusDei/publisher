import { randomUUID } from "node:crypto";
import { MetricsSchema, type Metrics } from "@publisher/shared";
import type { DB } from "./db.js";

/** A stored metrics snapshot with persistence identity. */
export interface StoredMetrics {
  id: string;
  runId: string;
  createdAt: string;
  metrics: Metrics;
}

/** Projection store for per-run metrics snapshots. */
export interface MetricStore {
  insert(runId: string, metrics: Metrics): StoredMetrics;
  listByRun(runId: string): StoredMetrics[];
}

interface MetricRow {
  id: string;
  run_id: string;
  snapshot: string;
  created_at: string;
}

export function createMetricStore(
  db: DB,
  newId: () => string = randomUUID,
  now: () => string = () => new Date().toISOString(),
): MetricStore {
  const insertStmt = db.prepare(
    `INSERT INTO metrics (id, run_id, snapshot, created_at) VALUES (?, ?, ?, ?)`,
  );
  const listStmt = db.prepare(
    `SELECT * FROM metrics WHERE run_id = ? ORDER BY created_at DESC, id DESC`,
  );

  return {
    insert(runId, metrics) {
      const id = newId();
      const createdAt = now();
      insertStmt.run(id, runId, JSON.stringify(metrics), createdAt);
      return { id, runId, createdAt, metrics };
    },

    listByRun(runId) {
      return (listStmt.all(runId) as MetricRow[]).map((row) => ({
        id: row.id,
        runId: row.run_id,
        createdAt: row.created_at,
        metrics: MetricsSchema.parse(JSON.parse(row.snapshot)),
      }));
    },
  };
}
