import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Metrics, Webpage } from "@publisher/shared";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createMetricStore } from "../../src/stores/metric.store.js";
import { createWebpageStore } from "../../src/stores/webpage.store.js";
import { createObservabilityService } from "../../src/services/observability.service.js";
import type { TelemetrySnapshot } from "../../src/telemetry/metrics.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

/** A metrics snapshot with explicit per-phase token + research-loop counts. */
function metrics(
  research: { tokens: number; calls: number },
  build: { tokens: number; calls: number } = { tokens: 0, calls: 0 },
  refine: { tokens: number; calls: number } = { tokens: 0, calls: 0 },
): Metrics {
  return {
    perPhase: {
      research: { tokens: research.tokens, latencyMs: 0, calls: research.calls },
      build: { tokens: build.tokens, latencyMs: 0, calls: build.calls },
      refine: { tokens: refine.tokens, latencyMs: 0, calls: refine.calls },
    },
    errorRate: 0,
  };
}

function webpage(title: string): Webpage {
  return {
    title,
    html: "<p>x</p>",
    css: "",
    summary: "s",
    sourcesUsed: [],
  };
}

/** A deterministic stub OTel snapshot for the admin composition tests. */
function stubSnapshot(): TelemetrySnapshot {
  return {
    http: { count: 4, avg: 120, p95: 300, min: 50, max: 400 },
    runDuration: { count: 2, avg: 5000, p95: 8000, min: 4000, max: 8000 },
    phaseDurations: {
      research: { count: 2, avg: 1500, p95: 2000, min: 1000, max: 2000 },
      build: { count: 2, avg: 2500, p95: 3000, min: 2000, max: 3000 },
      refine: { count: 1, avg: 800, p95: 800, min: 800, max: 800 },
    },
    runAttempts: {
      research: { count: 2, avg: 1.5, p95: 2, min: 1, max: 2 },
      refine: { count: 1, avg: 1, p95: 1, min: 1, max: 1 },
    },
    checkpointScores: {},
    errorsByType: { timeout: 2, refusal: 1 },
    checkpointFailuresByGate: { quality: 1 },
    outcomesByStatus: { published: 2, failed: 1 },
    tokens: { total: 9999, cachedInput: 100, byPhase: {} },
    runsActive: 1,
  };
}

describe("ObservabilityService", () => {
  let db: DB;
  const T = () => "2026-06-13T00:00:00.000Z";

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
  });

  /** Seed two users, each with runs/metrics/webpages, returns the service. */
  function seedTwoUsers() {
    const runs = createRunStore(db, T);
    const metricStore = createMetricStore(db, undefined, T);
    const webpages = createWebpageStore(db, undefined, T);

    // Alice: published run (1000+500 tokens, 2 research calls) + failed run
    // (200 tokens, 1 research call).
    runs.create({
      id: "r_alice_pub",
      personaId: "p1",
      concept: "Alice Published",
      workerId: "mock",
      userId: "u_alice",
    });
    runs.updateStatus("r_alice_pub", "published");
    metricStore.insert(
      "r_alice_pub",
      metrics({ tokens: 1000, calls: 2 }, { tokens: 500, calls: 1 }),
    );
    webpages.insert("r_alice_pub", 1, webpage("Alice's Page"), true);

    runs.create({
      id: "r_alice_fail",
      personaId: "p1",
      concept: "Alice Failed",
      workerId: "mock",
      userId: "u_alice",
    });
    runs.updateStatus("r_alice_fail", "failed");
    metricStore.insert("r_alice_fail", metrics({ tokens: 200, calls: 1 }));

    // Bob: one published run with DIFFERENT tokens — must never leak to Alice.
    runs.create({
      id: "r_bob_pub",
      personaId: "p2",
      concept: "Bob Published",
      workerId: "mock",
      userId: "u_bob",
    });
    runs.updateStatus("r_bob_pub", "published");
    metricStore.insert(
      "r_bob_pub",
      metrics({ tokens: 7000, calls: 3 }, { tokens: 3000, calls: 1 }),
    );
    webpages.insert("r_bob_pub", 1, webpage("Bob's Page"), true);

    return createObservabilityService({
      runStore: runs,
      metricStore,
      webpageStore: webpages,
      db,
      telemetrySnapshot: stubSnapshot,
    });
  }

  describe("userObservability", () => {
    it("should aggregate token totals and outcomes scoped to one user (happy path)", () => {
      const svc = seedTwoUsers();
      const out = svc.userObservability("u_alice");

      // 1000+500 (published) + 200 (failed) = 1700 across Alice's runs.
      expect(out.totalTokensPublished).toBe(1700);
      expect(out.publishedCount).toBe(1);
      expect(out.failedCount).toBe(1);
      // 2 research calls (published) + 1 (failed) = 3 loops.
      expect(out.researchLoopCount).toBe(3);
      expect(out.perArticle).toHaveLength(2);
    });

    it("should NOT leak another user's runs into the scoped result (isolation)", () => {
      const svc = seedTwoUsers();
      const alice = svc.userObservability("u_alice");
      // Bob's 7000+3000 tokens must be absent from Alice's view.
      expect(alice.totalTokensPublished).toBe(1700);
      const ids = alice.perArticle.map((a) => a.runId);
      expect(ids).not.toContain("r_bob_pub");
      expect(ids).toEqual(
        expect.arrayContaining(["r_alice_pub", "r_alice_fail"]),
      );
    });

    it("should expose per-article title/tokens/status, preferring the published webpage title", () => {
      const svc = seedTwoUsers();
      const out = svc.userObservability("u_alice");
      const pub = out.perArticle.find((a) => a.runId === "r_alice_pub");
      expect(pub).toBeDefined();
      expect(pub?.title).toBe("Alice's Page");
      expect(pub?.tokens).toBe(1500);
      expect(pub?.status).toBe("published");
    });

    it("should return empty/zero aggregates for a user with no runs (edge case)", () => {
      const svc = seedTwoUsers();
      const out = svc.userObservability("u_nobody");
      expect(out).toEqual({
        totalTokensPublished: 0,
        perArticle: [],
        researchLoopCount: 0,
        publishedCount: 0,
        failedCount: 0,
      });
    });
  });

  describe("adminObservability", () => {
    it("should aggregate token totals across ALL users (happy path)", () => {
      const svc = seedTwoUsers();
      const out = svc.adminObservability();
      // Alice 1700 + Bob 10000 = 11700 across every run.
      expect(out.tokenTotals).toBe(11700);
      expect(out.publishedCount).toBe(2);
      expect(out.rejectedCount).toBe(1);
    });

    it("should compute the rejected ratio across all runs (edge case)", () => {
      const svc = seedTwoUsers();
      const out = svc.adminObservability();
      // 1 failed of 3 total runs.
      expect(out.rejectedRatio).toBeCloseTo(1 / 3, 5);
    });

    it("should compose the injected OTel curated snapshot (composition)", () => {
      const svc = seedTwoUsers();
      const out = svc.adminObservability();
      // Flattened from the OTel snapshot for the admin page contract.
      expect(out.latency).toEqual({ avgMs: 120, p95Ms: 300 });
      expect(out.phaseDurations).toEqual({
        research: 1500,
        build: 2500,
        refine: 800,
      });
      expect(out.errorsByType).toEqual({ timeout: 2, refusal: 1 });
    });

    it("should report a zero rejected ratio when there are no runs (edge case)", () => {
      const svc = createObservabilityService({
        runStore: createRunStore(db, T),
        metricStore: createMetricStore(db, undefined, T),
        webpageStore: createWebpageStore(db, undefined, T),
        db,
        telemetrySnapshot: stubSnapshot,
      });
      const out = svc.adminObservability();
      expect(out.tokenTotals).toBe(0);
      expect(out.publishedCount).toBe(0);
      expect(out.rejectedCount).toBe(0);
      expect(out.rejectedRatio).toBe(0);
    });
  });
});
