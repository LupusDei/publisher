import { RunSchema, type Run, type RunStatus } from "@publisher/shared";
import type { DB } from "./db.js";

/** Fields supplied at run-creation time; status/timestamps are assigned here. */
export interface NewRun {
  id: string;
  personaId: string;
  concept: string;
  workerId: string;
}

/** Data-access contract for run header rows (Constitution Rule 4). */
export interface RunStore {
  create(input: NewRun): Run;
  get(id: string): Run | null;
  list(): Run[];
  updateStatus(id: string, status: RunStatus): Run;
}

interface RunRow {
  id: string;
  persona_id: string;
  concept: string;
  worker_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToRun(row: RunRow): Run {
  // Validate on read — the DB is a boundary (Constitution Rule 2).
  return RunSchema.parse({
    id: row.id,
    personaId: row.persona_id,
    concept: row.concept,
    workerId: row.worker_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function createRunStore(
  db: DB,
  now: () => string = () => new Date().toISOString(),
): RunStore {
  const insertStmt = db.prepare(
    `INSERT INTO runs (id, persona_id, concept, worker_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const getStmt = db.prepare(`SELECT * FROM runs WHERE id = ?`);
  const listStmt = db.prepare(
    `SELECT * FROM runs ORDER BY created_at DESC, id DESC`,
  );
  const updateStmt = db.prepare(
    `UPDATE runs SET status = ?, updated_at = ? WHERE id = ?`,
  );

  const store: RunStore = {
    create(input) {
      const ts = now();
      insertStmt.run(
        input.id,
        input.personaId,
        input.concept,
        input.workerId,
        "created",
        ts,
        ts,
      );
      const created = store.get(input.id);
      if (!created) {
        throw new Error(
          `Run ${input.id} was inserted but could not be read back`,
        );
      }
      return created;
    },

    get(id) {
      const row = getStmt.get(id) as RunRow | undefined;
      return row ? rowToRun(row) : null;
    },

    list() {
      return (listStmt.all() as RunRow[]).map(rowToRun);
    },

    updateStatus(id, status) {
      const result = updateStmt.run(status, now(), id);
      if (result.changes === 0) {
        throw new Error(`Run ${id} not found for status update`);
      }
      const updated = store.get(id);
      if (!updated) {
        throw new Error(`Run ${id} could not be read back after update`);
      }
      return updated;
    },
  };

  return store;
}
