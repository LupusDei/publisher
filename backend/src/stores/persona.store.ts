import { randomUUID } from "node:crypto";
import {
  PersonaSchema,
  type Persona,
  type NewPersona,
} from "@publisher/shared";
import type { DB } from "./db.js";

/** A partial edit to a persona. `id` cannot change; every other declared field
 * may be patched. Array/object fields are replaced wholesale, not merged
 * (ASSUMPTIONS D19 — edit/enrich for HITL). */
export type PersonaPatch = Partial<NewPersona>;

/** Data-access contract for personas. Callers depend on this interface, not on
 * the SQLite implementation (Constitution Rule 4). */
export interface PersonaStore {
  /** Create a persona, optionally stamping the owning user (85q.4). `ownerId`
   * is null for un-owned seed data; new authoring writes always pass it. */
  create(input: NewPersona, ownerId?: string | null): Persona;
  getById(id: string): Persona | null;
  /** List personas; with `ownerId`, only that owner's (the route passes the
   * viewer's id for non-admins, and nothing for admins → all). */
  list(ownerId?: string): Persona[];
  /** The owning user id for a persona, or null (un-owned OR unknown id). The
   * route distinguishes the two via getById before consulting ownerOf. */
  ownerOf(id: string): string | null;
  /** Apply a partial patch to an existing persona; returns the updated record,
   * or null if no persona with that id exists (D19 — enrich on escalation). */
  update(id: string, patch: PersonaPatch): Persona | null;
}

interface PersonaRow {
  id: string;
  name: string;
  voice: string;
  voice_sample: string;
  style_points: string;
  key_learnings: string;
  design_elements: string;
  created_at: string;
}

function rowToPersona(row: PersonaRow): Persona {
  // Validate on read — the DB is a boundary (Constitution Rule 2).
  return PersonaSchema.parse({
    id: row.id,
    name: row.name,
    voice: row.voice,
    voiceSample: row.voice_sample,
    stylePoints: JSON.parse(row.style_points) as unknown,
    keyLearnings: JSON.parse(row.key_learnings) as unknown,
    designElements: JSON.parse(row.design_elements) as unknown,
  });
}

export function createPersonaStore(
  db: DB,
  newId: () => string = randomUUID,
  now: () => string = () => new Date().toISOString(),
): PersonaStore {
  const insertStmt = db.prepare(
    `INSERT INTO personas
       (id, name, voice, voice_sample, style_points, key_learnings, design_elements, created_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const getStmt = db.prepare(`SELECT * FROM personas WHERE id = ?`);
  const listStmt = db.prepare(
    `SELECT * FROM personas ORDER BY created_at ASC, id ASC`,
  );
  const listByOwnerStmt = db.prepare(
    `SELECT * FROM personas WHERE user_id = ? ORDER BY created_at ASC, id ASC`,
  );
  const ownerStmt = db.prepare(`SELECT user_id FROM personas WHERE id = ?`);
  const updateStmt = db.prepare(
    `UPDATE personas
        SET name = ?, voice = ?, voice_sample = ?,
            style_points = ?, key_learnings = ?, design_elements = ?
      WHERE id = ?`,
  );

  const store: PersonaStore = {
    create(input, ownerId = null) {
      const id = newId();
      insertStmt.run(
        id,
        input.name,
        input.voice,
        input.voiceSample,
        JSON.stringify(input.stylePoints),
        JSON.stringify(input.keyLearnings),
        JSON.stringify(input.designElements),
        now(),
        ownerId,
      );
      const created = store.getById(id);
      if (!created) {
        throw new Error(
          `Persona ${id} was inserted but could not be read back`,
        );
      }
      return created;
    },

    getById(id) {
      const row = getStmt.get(id) as PersonaRow | undefined;
      return row ? rowToPersona(row) : null;
    },

    list(ownerId) {
      const rows = (
        ownerId === undefined ? listStmt.all() : listByOwnerStmt.all(ownerId)
      ) as PersonaRow[];
      return rows.map(rowToPersona);
    },

    ownerOf(id) {
      const row = ownerStmt.get(id) as { user_id: string | null } | undefined;
      return row?.user_id ?? null;
    },

    update(id, patch) {
      const existing = store.getById(id);
      if (!existing) {
        return null;
      }
      // Patch over the current record, then re-validate before writing so the
      // DB never holds a persona that violates the contract (Rule 2).
      const next = PersonaSchema.parse({ ...existing, ...patch, id });
      updateStmt.run(
        next.name,
        next.voice,
        next.voiceSample,
        JSON.stringify(next.stylePoints),
        JSON.stringify(next.keyLearnings),
        JSON.stringify(next.designElements),
        id,
      );
      return next;
    },
  };

  return store;
}
