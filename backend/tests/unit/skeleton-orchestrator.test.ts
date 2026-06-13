import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createRunEventStore } from "../../src/stores/run-event.store.js";
import { createWebpageStore } from "../../src/stores/webpage.store.js";
import { MockAgent } from "../../src/agent/mock-agent.js";
import { createFileSink } from "../../src/material/sink.js";
import { runSkeleton } from "../../src/orchestrator/skeleton.js";
import type { Material } from "@publisher/shared";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const material: Material = {
  concept: "On Emergence",
  persona: {
    id: "p_1",
    name: "The Essayist",
    voice: "Measured.",
    voiceSample: "Emergence is not magic.",
    stylePoints: [],
    keyLearnings: [],
    designElements: {},
  },
};

describe("runSkeleton", () => {
  let db: DB;
  let publishDir: string;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
    publishDir = mkdtempSync(join(tmpdir(), "publisher-skeleton-"));
  });

  function deps() {
    return {
      agent: new MockAgent(),
      sink: createFileSink({ dir: publishDir, baseUrl: "" }),
      runStore: createRunStore(db, () => "2026-06-13T00:00:00.000Z"),
      eventStore: createRunEventStore(db),
      webpageStore: createWebpageStore(
        db,
        () => "wp_1",
        () => "t",
      ),
      compileSystem: () => "SYSTEM PROMPT",
    };
  }

  it("should run research -> build -> checkpoint -> publish and return a receipt", async () => {
    const result = await runSkeleton(deps(), {
      runId: "run_1",
      material,
      workerId: "mock",
    });
    expect(result.receipt.id).toBe("run_1");
    expect(result.receipt.workerId).toBe("mock");
    expect(result.receipt.bytes).toBeGreaterThan(0);
  });

  it("should append phase, draft, checkpoint and published events with monotonic seq", async () => {
    await runSkeleton(deps(), { runId: "run_1", material, workerId: "mock" });
    const events = createRunEventStore(db).load("run_1");
    const types = events.map((e) => e.t);
    expect(types).toContain("phase");
    expect(types).toContain("draft");
    expect(types).toContain("checkpoint");
    expect(types[types.length - 1]).toBe("published");
    // Monotonic seq starting at 0.
    expect(events.map((e) => e.seq)).toEqual(events.map((_e, i) => i));
  });

  it("should mark the run published and emit an always-passing checkpoint", async () => {
    await runSkeleton(deps(), { runId: "run_1", material, workerId: "mock" });
    const run = createRunStore(db).get("run_1");
    expect(run?.status).toBe("published");
    const events = createRunEventStore(db).load("run_1");
    const checkpoint = events.find((e) => e.t === "checkpoint");
    expect(checkpoint?.t).toBe("checkpoint");
    if (checkpoint?.t === "checkpoint") {
      expect(checkpoint.result.passed).toBe(true);
    }
  });

  it("should persist the published webpage attempt (edge — projection wired)", async () => {
    await runSkeleton(deps(), { runId: "run_1", material, workerId: "mock" });
    const pages = createWebpageStore(db).listByRun("run_1");
    expect(pages).toHaveLength(1);
    expect(pages[0]?.published).toBe(true);
  });
});
