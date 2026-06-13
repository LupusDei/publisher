import { ShareSchema, type Share } from "@publisher/shared";
import type { DB } from "./db.js";

/** Fields supplied when minting a share; id/createdAt/revokedAt are assigned
 * here. `ownerId` is null for an un-owned run (mirrors runs.user_id). */
export interface NewShare {
  slug: string;
  runId: string;
  ownerId: string | null;
}

/**
 * Data-access contract for share rows (Constitution §4 — the ONLY SQL layer for
 * shares). The active-run partial unique index (migration 0005) makes `create`
 * throw on a second active share for a run, which the service relies on for
 * idempotent mint. All reads are validated through `ShareSchema` (§2).
 */
export interface ShareStore {
  /** Insert a new active share. Throws (unique-index violation) if the run
   * already has an active share. */
  create(input: NewShare): Share;
  /** The share with this slug, or null. Returns revoked rows too — callers
   * decide whether `revokedAt` matters (the public route treats revoked = 404). */
  getBySlug(slug: string): Share | null;
  /** The single ACTIVE (revoked_at IS NULL) share for a run, or null. */
  getActiveByRun(runId: string): Share | null;
  /** Stamp revoked_at on the run's active share. No-op when none is active. */
  revoke(runId: string): void;
}

interface ShareRow {
  id: string;
  slug: string;
  run_id: string;
  owner_id: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** Map a snake_case DB row to the camelCase contract and validate at the
 * boundary (Constitution §2). `id` is internal-only and not part of Share. */
function rowToShare(row: ShareRow): Share {
  return ShareSchema.parse({
    slug: row.slug,
    runId: row.run_id,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  });
}

export function createShareStore(
  db: DB,
  now: () => string = () => new Date().toISOString(),
  newId: () => string = () =>
    `share_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
): ShareStore {
  const insertStmt = db.prepare(
    `INSERT INTO shares (id, slug, run_id, owner_id, created_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  );
  const getBySlugStmt = db.prepare(`SELECT * FROM shares WHERE slug = ?`);
  const getActiveByRunStmt = db.prepare(
    `SELECT * FROM shares WHERE run_id = ? AND revoked_at IS NULL`,
  );
  const revokeStmt = db.prepare(
    `UPDATE shares SET revoked_at = ? WHERE run_id = ? AND revoked_at IS NULL`,
  );

  const store: ShareStore = {
    create(input) {
      insertStmt.run(newId(), input.slug, input.runId, input.ownerId, now());
      const created = store.getBySlug(input.slug);
      if (!created) {
        throw new Error(
          `Share ${input.slug} was inserted but could not be read back`,
        );
      }
      return created;
    },

    getBySlug(slug) {
      const row = getBySlugStmt.get(slug) as ShareRow | undefined;
      return row ? rowToShare(row) : null;
    },

    getActiveByRun(runId) {
      const row = getActiveByRunStmt.get(runId) as ShareRow | undefined;
      return row ? rowToShare(row) : null;
    },

    revoke(runId) {
      revokeStmt.run(now(), runId);
    },
  };

  return store;
}
