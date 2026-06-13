import { randomUUID } from "node:crypto";
import { AlarmSchema, type Alarm, type Phase } from "@publisher/shared";
import type { DB } from "./db.js";

/** A stored alarm with persistence identity + the phase it fired in (D6). */
export interface StoredAlarm {
  id: string;
  runId: string;
  phase?: Phase;
  createdAt: string;
  alarm: Alarm;
}

/** Projection store for structured alarms. */
export interface AlarmStore {
  insert(runId: string, phase: Phase | undefined, alarm: Alarm): StoredAlarm;
  listByRun(runId: string): StoredAlarm[];
}

interface AlarmRow {
  id: string;
  run_id: string;
  type: string;
  severity: string;
  phase: string | null;
  recommended_action: string;
  context: string;
  created_at: string;
}

export function createAlarmStore(
  db: DB,
  newId: () => string = randomUUID,
  now: () => string = () => new Date().toISOString(),
): AlarmStore {
  const insertStmt = db.prepare(
    `INSERT INTO alarms
       (id, run_id, type, severity, phase, recommended_action, context, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const listStmt = db.prepare(
    `SELECT * FROM alarms WHERE run_id = ? ORDER BY created_at ASC, id ASC`,
  );

  return {
    insert(runId, phase, alarm) {
      const id = newId();
      const createdAt = now();
      insertStmt.run(
        id,
        runId,
        alarm.type,
        alarm.severity,
        phase ?? null,
        alarm.recommendedAction,
        JSON.stringify(alarm.context),
        createdAt,
      );
      return phase === undefined
        ? { id, runId, createdAt, alarm }
        : { id, runId, phase, createdAt, alarm };
    },

    listByRun(runId) {
      return (listStmt.all(runId) as AlarmRow[]).map((row) => {
        const alarm = AlarmSchema.parse({
          type: row.type,
          severity: row.severity,
          context: JSON.parse(row.context) as unknown,
          recommendedAction: row.recommended_action,
        });
        const base = {
          id: row.id,
          runId: row.run_id,
          createdAt: row.created_at,
          alarm,
        };
        return row.phase === null
          ? base
          : { ...base, phase: row.phase as Phase };
      });
    },
  };
}
