import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { RunStatus } from "@publisher/shared";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createRunStore, type RunStore } from "../../src/stores/run.store.js";
import { reconcileInterruptedRuns } from "../../src/orchestrator/reconcile.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

function seedRun(store: RunStore, id: string, status: RunStatus): void {
  store.create({ id, personaId: "p_1", concept: "c", workerId: "mock" });
  store.updateStatus(id, status);
}

describe("reconcileInterruptedRuns", () => {
  let db: DB;
  let store: RunStore;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
    store = createRunStore(db);
  });

  it("should mark every active-status run as interrupted (happy path)", () => {
    seedRun(store, "r_research", "researching");
    seedRun(store, "r_build", "building");
    seedRun(store, "r_check", "checking");
    seedRun(store, "r_refine", "refining");

    const marked = reconcileInterruptedRuns(store).sort();

    expect(marked).toEqual(["r_build", "r_check", "r_refine", "r_research"]);
    for (const id of marked) {
      expect(store.get(id)?.status).toBe("interrupted");
    }
  });

  it("should leave paused and terminal runs untouched (edge case)", () => {
    seedRun(store, "r_escalated", "escalated");
    seedRun(store, "r_await", "awaiting_approval");
    seedRun(store, "r_published", "published");
    seedRun(store, "r_failed", "failed");
    seedRun(store, "r_active", "building");

    const marked = reconcileInterruptedRuns(store);

    expect(marked).toEqual(["r_active"]);
    expect(store.get("r_escalated")?.status).toBe("escalated");
    expect(store.get("r_await")?.status).toBe("awaiting_approval");
    expect(store.get("r_published")?.status).toBe("published");
    expect(store.get("r_failed")?.status).toBe("failed");
  });

  it("should be a no-op (empty result) when nothing is active (error/edge path)", () => {
    seedRun(store, "r_published", "published");
    expect(reconcileInterruptedRuns(store)).toEqual([]);
  });
});
