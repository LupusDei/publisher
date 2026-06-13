import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createShareStore } from "../../src/stores/share.store.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

/**
 * share.1.4 — the ShareStore is the ONLY layer that touches SQL for shares
 * (Constitution §4). It validates every read through ShareSchema (boundary,
 * §2) and takes injected clock + id generator so tests are deterministic. The
 * active-run partial unique index (migration 0005) is the idempotency
 * cornerstone — these tests pin that a second ACTIVE share on a run is rejected,
 * yet a re-share after revoke succeeds.
 */
function setup(): {
  db: DB;
  store: ReturnType<typeof createShareStore>;
  runId: string;
} {
  const db = openDb(":memory:");
  runMigrations(db, loadMigrations(migrationsDir));
  // A real run row to satisfy the run_id FK.
  const runStore = createRunStore(db, () => "2026-06-13T00:00:00.000Z");
  const run = runStore.create({
    id: "run_1",
    personaId: "p_1",
    concept: "On Emergence",
    workerId: "mock",
    userId: "u_owner",
  });
  let n = 0;
  const store = createShareStore(
    db,
    () => "2026-06-13T00:00:00.000Z",
    () => `share_${(n += 1)}`,
  );
  return { db, store, runId: run.id };
}

describe("ShareStore", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it("should create an active share and round-trip it via getBySlug (happy path)", () => {
    const created = ctx.store.create({
      slug: "Zx9_QmA1bC2dE3fG4hI5jK6l",
      runId: ctx.runId,
      ownerId: "u_owner",
    });
    expect(created.slug).toBe("Zx9_QmA1bC2dE3fG4hI5jK6l");
    expect(created.runId).toBe(ctx.runId);
    expect(created.ownerId).toBe("u_owner");
    expect(created.revokedAt).toBeNull();
    expect(created.createdAt).toBe("2026-06-13T00:00:00.000Z");
    expect(ctx.store.getBySlug("Zx9_QmA1bC2dE3fG4hI5jK6l")).toEqual(created);
  });

  it("should return null from getBySlug for an unknown slug (error/edge path)", () => {
    expect(ctx.store.getBySlug("does-not-exist-000000")).toBeNull();
  });

  it("should accept a null ownerId for an un-owned run (edge case)", () => {
    const created = ctx.store.create({
      slug: "unowned_slug_000000000000",
      runId: ctx.runId,
      ownerId: null,
    });
    expect(created.ownerId).toBeNull();
  });

  it("getActiveByRun should return the active share and ignore revoked rows", () => {
    const created = ctx.store.create({
      slug: "active_slug_0000000000000",
      runId: ctx.runId,
      ownerId: "u_owner",
    });
    expect(ctx.store.getActiveByRun(ctx.runId)).toEqual(created);
    ctx.store.revoke(ctx.runId);
    // After revoke there is no active share for the run.
    expect(ctx.store.getActiveByRun(ctx.runId)).toBeNull();
  });

  it("getActiveByRun should return null when a run has never been shared (edge case)", () => {
    expect(ctx.store.getActiveByRun("run_never_shared")).toBeNull();
  });

  it("revoke should stamp revoked_at so the slug no longer resolves as active", () => {
    ctx.store.create({
      slug: "revoke_me_00000000000000",
      runId: ctx.runId,
      ownerId: "u_owner",
    });
    ctx.store.revoke(ctx.runId);
    const row = ctx.store.getBySlug("revoke_me_00000000000000");
    expect(row?.revokedAt).toBe("2026-06-13T00:00:00.000Z");
  });

  it("revoke should be a no-op when there is no active share (idempotent edge case)", () => {
    // Should not throw and should leave no active share.
    expect(() => ctx.store.revoke(ctx.runId)).not.toThrow();
    expect(ctx.store.getActiveByRun(ctx.runId)).toBeNull();
  });

  it("should REJECT a second active share on the same run (partial unique index)", () => {
    ctx.store.create({
      slug: "first_active_0000000000000",
      runId: ctx.runId,
      ownerId: "u_owner",
    });
    expect(() =>
      ctx.store.create({
        slug: "second_active_000000000000",
        runId: ctx.runId,
        ownerId: "u_owner",
      }),
    ).toThrow();
  });

  it("should ALLOW a new active share after the prior one is revoked (re-share)", () => {
    ctx.store.create({
      slug: "old_active_00000000000000",
      runId: ctx.runId,
      ownerId: "u_owner",
    });
    ctx.store.revoke(ctx.runId);
    const reshared = ctx.store.create({
      slug: "new_active_00000000000000",
      runId: ctx.runId,
      ownerId: "u_owner",
    });
    expect(reshared.revokedAt).toBeNull();
    expect(ctx.store.getActiveByRun(ctx.runId)).toEqual(reshared);
  });
});
