import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ResearchResult } from "@publisher/shared";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createResearchStore } from "../../src/stores/research.store.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const research = (text: string, sources: string[] = []): ResearchResult => ({
  text,
  sources,
});

describe("ResearchStore", () => {
  let db: DB;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
    // Parent run row (the research table references runs(id)).
    createRunStore(db).create({
      id: "run_1",
      personaId: "p_1",
      concept: "On Emergence",
      workerId: "mock",
    });
  });

  it("should round-trip a saved research result with its sources (happy path)", () => {
    const store = createResearchStore(db, () => "id-1", () => "2026-06-13T00:00:00.000Z");
    const saved = store.save(
      "run_1",
      1,
      research("orbits decay via tidal drag", ["https://a.test", "https://b.test"]),
    );
    expect(saved).toEqual({
      id: "id-1",
      runId: "run_1",
      attempt: 1,
      createdAt: "2026-06-13T00:00:00.000Z",
      research: research("orbits decay via tidal drag", [
        "https://a.test",
        "https://b.test",
      ]),
    });
    expect(store.latest("run_1")?.research).toEqual(
      research("orbits decay via tidal drag", [
        "https://a.test",
        "https://b.test",
      ]),
    );
  });

  it("should return null when a run has no persisted research (error/edge path)", () => {
    const store = createResearchStore(db);
    expect(store.latest("run_1")).toBeNull();
    expect(store.latest("nope")).toBeNull();
  });

  it("should return the MOST RECENTLY saved research across attempts (state change)", () => {
    const store = createResearchStore(db);
    store.save("run_1", 1, research("thin first pass", ["https://one.test"]));
    store.save("run_1", 2, research("deeper re-research", ["https://x.test", "https://y.test"]));
    const latest = store.latest("run_1");
    expect(latest?.attempt).toBe(2);
    expect(latest?.research.text).toBe("deeper re-research");
    expect(latest?.research.sources).toHaveLength(2);
  });
});
