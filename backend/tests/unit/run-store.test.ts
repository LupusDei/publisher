import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createRunStore } from "../../src/stores/run.store.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

describe("RunStore", () => {
  let db: DB;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
  });

  it("should create a run with status 'created' and round-trip it", () => {
    const store = createRunStore(db, () => "2026-06-13T00:00:00.000Z");
    const run = store.create({
      id: "run_1",
      personaId: "p_1",
      concept: "On Emergence",
      workerId: "mock",
    });
    expect(run.status).toBe("created");
    expect(run.concept).toBe("On Emergence");
    expect(store.get("run_1")).toEqual(run);
  });

  it("should return null for an unknown run (error/edge path)", () => {
    const store = createRunStore(db);
    expect(store.get("nope")).toBeNull();
  });

  it("should update status and bump updatedAt", () => {
    let t = 0;
    const times = ["2026-06-13T00:00:00.000Z", "2026-06-13T00:00:05.000Z"];
    const store = createRunStore(
      db,
      () => times[t++] ?? "2026-06-13T00:01:00.000Z",
    );
    store.create({
      id: "run_1",
      personaId: "p_1",
      concept: "c",
      workerId: "mock",
    });
    const updated = store.updateStatus("run_1", "published");
    expect(updated.status).toBe("published");
    expect(updated.updatedAt).toBe("2026-06-13T00:00:05.000Z");
  });

  it("should list runs newest-first", () => {
    let t = 0;
    const times = ["2026-06-13T00:00:01.000Z", "2026-06-13T00:00:02.000Z"];
    const store = createRunStore(
      db,
      () => times[t++] ?? "2026-06-13T00:00:09.000Z",
    );
    store.create({
      id: "run_a",
      personaId: "p",
      concept: "c",
      workerId: "mock",
    });
    store.create({
      id: "run_b",
      personaId: "p",
      concept: "c",
      workerId: "mock",
    });
    expect(store.list().map((r) => r.id)).toEqual(["run_b", "run_a"]);
  });
});
