import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

function tableNames(db: DB): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

describe("migrations 0002 (runs + projections)", () => {
  let db: DB;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
  });

  it("should create runs and all projection tables on a fresh DB", () => {
    const names = tableNames(db);
    for (const t of [
      "runs",
      "run_events",
      "checkpoints",
      "alarms",
      "metrics",
      "escalations",
      "webpages",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("should be idempotent when migrations are re-applied", () => {
    const second = runMigrations(db, loadMigrations(migrationsDir));
    expect(second).toEqual([]); // nothing new to apply
  });

  it("should enforce a per-run monotonic seq on run_events (unique runId+seq)", () => {
    db.prepare(
      `INSERT INTO runs (id, persona_id, concept, worker_id, status, created_at, updated_at)
       VALUES ('run_1','p_1','c','mock','created','t','t')`,
    ).run();
    const insertEvent = db.prepare(
      `INSERT INTO run_events (run_id, seq, ts, type, payload) VALUES (?, ?, ?, ?, ?)`,
    );
    insertEvent.run("run_1", 0, "t", "phase", "{}");
    insertEvent.run("run_1", 1, "t", "phase", "{}");
    // Re-using seq 1 on the same run must violate the uniqueness constraint.
    expect(() => insertEvent.run("run_1", 1, "t", "phase", "{}")).toThrow();
  });

  it("should allow the same seq value across different runs (edge case)", () => {
    const insertRun = db.prepare(
      `INSERT INTO runs (id, persona_id, concept, worker_id, status, created_at, updated_at)
       VALUES (?, 'p_1','c','mock','created','t','t')`,
    );
    insertRun.run("run_a");
    insertRun.run("run_b");
    const insertEvent = db.prepare(
      `INSERT INTO run_events (run_id, seq, ts, type, payload) VALUES (?, 0, 't', 'phase', '{}')`,
    );
    insertEvent.run("run_a");
    expect(() => insertEvent.run("run_b")).not.toThrow();
  });
});
