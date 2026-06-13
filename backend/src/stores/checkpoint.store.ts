import { randomUUID } from "node:crypto";
import {
  CheckpointResultSchema,
  type CheckpointResult,
} from "@publisher/shared";
import type { DB } from "./db.js";

/** A stored checkpoint result with persistence identity (ASSUMPTIONS D6). */
export interface StoredCheckpointResult {
  id: string;
  runId: string;
  attempt: number;
  createdAt: string;
  result: CheckpointResult;
}

/** Projection store for explicit checkpoint pass/fail per attempt. */
export interface CheckpointStore {
  insert(
    runId: string,
    attempt: number,
    result: CheckpointResult,
  ): StoredCheckpointResult;
  listByRun(runId: string): StoredCheckpointResult[];
}

interface CheckpointRow {
  id: string;
  run_id: string;
  attempt: number;
  created_at: string;
  payload: string;
}

export function createCheckpointStore(
  db: DB,
  newId: () => string = randomUUID,
  now: () => string = () => new Date().toISOString(),
): CheckpointStore {
  const insertStmt = db.prepare(
    `INSERT INTO checkpoints
       (id, run_id, attempt, name, passed, score, threshold, details, created_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const listStmt = db.prepare(
    `SELECT * FROM checkpoints WHERE run_id = ? ORDER BY created_at ASC, id ASC`,
  );

  return {
    insert(runId, attempt, result) {
      const id = newId();
      const createdAt = now();
      insertStmt.run(
        id,
        runId,
        attempt,
        result.name,
        result.passed ? 1 : 0,
        result.score ?? null,
        result.threshold ?? null,
        result.details,
        createdAt,
        JSON.stringify(result),
      );
      return { id, runId, attempt, createdAt, result };
    },

    listByRun(runId) {
      return (listStmt.all(runId) as CheckpointRow[]).map((row) => ({
        id: row.id,
        runId: row.run_id,
        attempt: row.attempt,
        createdAt: row.created_at,
        result: CheckpointResultSchema.parse(JSON.parse(row.payload)),
      }));
    },
  };
}
