import {
  EscalationSchema,
  EscalationDecisionSchema,
  type Escalation,
  type EscalationDecision,
} from "@publisher/shared";
import type { DB } from "./db.js";

/** A stored escalation plus its resolution (undefined until resolved). */
export interface StoredEscalation {
  createdAt: string;
  escalation: Escalation;
  decision?: EscalationDecision;
}

/** Projection store for HITL escalations. */
export interface EscalationStore {
  insert(escalation: Escalation): StoredEscalation;
  listByRun(runId: string): StoredEscalation[];
  resolve(escalationId: string, decision: EscalationDecision): void;
}

interface EscalationRow {
  id: string;
  run_id: string;
  reason: string;
  options: string;
  alarm: string;
  decision: string | null;
  created_at: string;
}

export function createEscalationStore(
  db: DB,
  now: () => string = () => new Date().toISOString(),
): EscalationStore {
  const insertStmt = db.prepare(
    `INSERT INTO escalations (id, run_id, reason, options, alarm, decision, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const listStmt = db.prepare(
    `SELECT * FROM escalations WHERE run_id = ? ORDER BY created_at ASC, id ASC`,
  );
  const resolveStmt = db.prepare(
    `UPDATE escalations SET decision = ? WHERE id = ?`,
  );

  function rowToStored(row: EscalationRow): StoredEscalation {
    const escalation = EscalationSchema.parse({
      id: row.id,
      runId: row.run_id,
      reason: row.reason,
      options: JSON.parse(row.options) as unknown,
      alarm: JSON.parse(row.alarm) as unknown,
    });
    const base: StoredEscalation = { createdAt: row.created_at, escalation };
    if (row.decision !== null) {
      base.decision = EscalationDecisionSchema.parse(JSON.parse(row.decision));
    }
    return base;
  }

  return {
    insert(escalation) {
      const createdAt = now();
      insertStmt.run(
        escalation.id,
        escalation.runId,
        escalation.reason,
        JSON.stringify(escalation.options),
        JSON.stringify(escalation.alarm),
        null,
        createdAt,
      );
      return { createdAt, escalation };
    },

    listByRun(runId) {
      return (listStmt.all(runId) as EscalationRow[]).map(rowToStored);
    },

    resolve(escalationId, decision) {
      const result = resolveStmt.run(JSON.stringify(decision), escalationId);
      if (result.changes === 0) {
        throw new Error(`Escalation ${escalationId} not found to resolve`);
      }
    },
  };
}
