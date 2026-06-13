import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createRunEventStore } from "../../src/stores/run-event.store.js";
import type { RunEvent } from "@publisher/shared";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

function phaseEvent(runId: string, seq: number): RunEvent {
  return {
    runId,
    seq,
    ts: `2026-06-13T00:00:0${seq}.000Z`,
    t: "phase",
    phase: "research",
  };
}

describe("RunEventStore", () => {
  let db: DB;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
    createRunStore(db).create({
      id: "run_1",
      personaId: "p_1",
      concept: "On Emergence",
      workerId: "mock",
    });
  });

  it("should append events and load them all in seq order", () => {
    const store = createRunEventStore(db);
    store.append(phaseEvent("run_1", 0));
    store.append({ ...phaseEvent("run_1", 1), phase: "build" });
    store.append({ ...phaseEvent("run_1", 2), phase: "refine" });
    const all = store.load("run_1");
    expect(all.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(all[1]?.t).toBe("phase");
  });

  it("should reject a non-monotonic seq (append enforces it)", () => {
    const store = createRunEventStore(db);
    store.append(phaseEvent("run_1", 0));
    store.append(phaseEvent("run_1", 1));
    // Re-using seq 1 must throw (the WS/replay primitive depends on monotonicity).
    expect(() => store.append(phaseEvent("run_1", 1))).toThrow();
  });

  it("should reject a seq that is not the next expected value (gap)", () => {
    const store = createRunEventStore(db);
    store.append(phaseEvent("run_1", 0));
    expect(() => store.append(phaseEvent("run_1", 5))).toThrow();
  });

  it("loadSince should return only events with seq strictly greater (reconnect primitive)", () => {
    const store = createRunEventStore(db);
    for (let i = 0; i < 4; i++) store.append(phaseEvent("run_1", i));
    const since = store.loadSince("run_1", 1);
    expect(since.map((e) => e.seq)).toEqual([2, 3]);
  });

  it("loadSince(-1) should return the whole log; load on an empty run returns [] (edge case)", () => {
    const store = createRunEventStore(db);
    store.append(phaseEvent("run_1", 0));
    expect(store.loadSince("run_1", -1).map((e) => e.seq)).toEqual([0]);
    expect(store.load("run_missing")).toEqual([]);
  });

  it("should round-trip a draft event with its full webpage payload", () => {
    const store = createRunEventStore(db);
    const draft: RunEvent = {
      runId: "run_1",
      seq: 0,
      ts: "2026-06-13T00:00:00.000Z",
      t: "draft",
      attempt: 1,
      webpage: {
        title: "T",
        html: "<main>x</main>",
        css: "",
        summary: "s",
        sourcesUsed: [],
      },
      score: 0.42,
      passed: false,
    };
    store.append(draft);
    const [loaded] = store.load("run_1");
    expect(loaded).toEqual(draft);
  });
});
