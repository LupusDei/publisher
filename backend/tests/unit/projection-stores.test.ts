import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createCheckpointStore } from "../../src/stores/checkpoint.store.js";
import { createAlarmStore } from "../../src/stores/alarm.store.js";
import { createMetricStore } from "../../src/stores/metric.store.js";
import { createEscalationStore } from "../../src/stores/escalation.store.js";
import { createWebpageStore } from "../../src/stores/webpage.store.js";
import type {
  Alarm,
  CheckpointResult,
  Escalation,
  Metrics,
  Webpage,
} from "@publisher/shared";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const checkpointResult: CheckpointResult = {
  name: "voice-fidelity",
  passed: false,
  score: 0.42,
  threshold: 0.75,
  details: "Voice drifted formal.",
  autoCorrectable: true,
  feedback: "Match the voice sample.",
  alarms: [],
};
const alarm: Alarm = {
  type: "VOICE_DRIFT",
  severity: "warning",
  context: { score: 0.42 },
  recommendedAction: "Refine to match the sample.",
};
const metrics: Metrics = {
  perPhase: {
    research: { tokens: 100, latencyMs: 500, calls: 1 },
    build: { tokens: 800, latencyMs: 2000, calls: 1 },
    refine: { tokens: 0, latencyMs: 0, calls: 0 },
  },
  errorRate: 0,
};
const webpage: Webpage = {
  title: "T",
  html: "<main>x</main>",
  css: "",
  summary: "s",
  sourcesUsed: ["https://example.com/a"],
};
const escalation: Escalation = {
  id: "esc_1",
  runId: "run_1",
  reason: "Token budget exceeded.",
  alarm: { ...alarm, type: "TOKEN_BUDGET_EXCEEDED", severity: "critical" },
  options: ["enrich_persona", "approve_anyway"],
};

describe("projection stores", () => {
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

  it("CheckpointStore should insert and query results by run", () => {
    const store = createCheckpointStore(
      db,
      () => "cp_1",
      () => "t",
    );
    store.insert("run_1", 1, checkpointResult);
    const rows = store.listByRun("run_1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.result).toEqual(checkpointResult);
    expect(rows[0]?.attempt).toBe(1);
  });

  it("AlarmStore should insert and query alarms by run", () => {
    const store = createAlarmStore(
      db,
      () => "al_1",
      () => "t",
    );
    store.insert("run_1", "build", alarm);
    const rows = store.listByRun("run_1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.alarm).toEqual(alarm);
    expect(rows[0]?.phase).toBe("build");
  });

  it("AlarmStore should accept an alarm with no phase (edge case)", () => {
    const store = createAlarmStore(
      db,
      () => "al_2",
      () => "t",
    );
    store.insert("run_1", undefined, alarm);
    expect(store.listByRun("run_1")[0]?.phase).toBeUndefined();
  });

  it("MetricStore should insert and query the latest snapshot by run", () => {
    const store = createMetricStore(
      db,
      () => "m_1",
      () => "t",
    );
    store.insert("run_1", metrics);
    const rows = store.listByRun("run_1");
    expect(rows[0]?.metrics).toEqual(metrics);
  });

  it("EscalationStore should insert, query, and resolve by run", () => {
    const store = createEscalationStore(db, () => "t");
    store.insert(escalation);
    const open = store.listByRun("run_1");
    expect(open[0]?.escalation).toEqual(escalation);
    expect(open[0]?.decision).toBeUndefined();
    store.resolve("esc_1", { escalationId: "esc_1", choice: "approve_anyway" });
    expect(store.listByRun("run_1")[0]?.decision?.choice).toBe(
      "approve_anyway",
    );
  });

  it("WebpageStore should insert every attempt and flag the published one", () => {
    const store = createWebpageStore(
      db,
      () => "wp_1",
      () => "t",
    );
    store.insert("run_1", 1, webpage, false);
    const store2 = createWebpageStore(
      db,
      () => "wp_2",
      () => "t",
    );
    store2.insert("run_1", 2, webpage, true);
    const rows = store.listByRun("run_1");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.published)?.attempt).toBe(2);
    expect(rows[0]?.webpage).toEqual(webpage);
  });

  it("WebpageStore should return [] for a run with no attempts (edge case)", () => {
    const store = createWebpageStore(
      db,
      () => "wp_x",
      () => "t",
    );
    expect(store.listByRun("run_missing")).toEqual([]);
  });
});
