import { RunEventSchema, type RunEvent } from "@publisher/shared";
import type { DB } from "./db.js";

/**
 * The authoritative event-log store (ASSUMPTIONS D5). `append` enforces a
 * per-run MONOTONIC `seq` (each event's seq must be exactly the previous max + 1,
 * starting at 0). `loadSince(runId, seq)` returns events with seq strictly
 * greater — the WS-reconnect / replay primitive. `load` returns the whole run
 * in seq order.
 */
export interface RunEventStore {
  append(event: RunEvent): void;
  load(runId: string): RunEvent[];
  loadSince(runId: string, seq: number): RunEvent[];
}

interface EventRow {
  payload: string;
}

function rowToEvent(row: EventRow): RunEvent {
  return RunEventSchema.parse(JSON.parse(row.payload));
}

export function createRunEventStore(db: DB): RunEventStore {
  const maxSeqStmt = db.prepare(
    `SELECT MAX(seq) AS maxSeq FROM run_events WHERE run_id = ?`,
  );
  const insertStmt = db.prepare(
    `INSERT INTO run_events (run_id, seq, ts, type, pillar, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const loadStmt = db.prepare(
    `SELECT payload FROM run_events WHERE run_id = ? ORDER BY seq ASC`,
  );
  const loadSinceStmt = db.prepare(
    `SELECT payload FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC`,
  );

  return {
    append(event) {
      const row = maxSeqStmt.get(event.runId) as { maxSeq: number | null };
      const expected = row.maxSeq === null ? 0 : row.maxSeq + 1;
      if (event.seq !== expected) {
        throw new Error(
          `Non-monotonic seq for run ${event.runId}: expected ${expected}, got ${event.seq}`,
        );
      }
      insertStmt.run(
        event.runId,
        event.seq,
        event.ts,
        event.t,
        event.pillar ?? null,
        JSON.stringify(event),
      );
    },

    load(runId) {
      return (loadStmt.all(runId) as EventRow[]).map(rowToEvent);
    },

    loadSince(runId, seq) {
      return (loadSinceStmt.all(runId, seq) as EventRow[]).map(rowToEvent);
    },
  };
}
