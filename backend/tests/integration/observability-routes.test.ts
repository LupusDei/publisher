import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Express } from "express";
import type { Metrics, Webpage } from "@publisher/shared";
import { createApp } from "../../src/app.js";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createMetricStore } from "../../src/stores/metric.store.js";
import { createWebpageStore } from "../../src/stores/webpage.store.js";
import { createObservabilityService } from "../../src/services/observability.service.js";
import {
  meObservabilityRouter,
  adminObservabilityRouter,
} from "../../src/routes/observability.js";
import { createJwt } from "../../src/auth/jwt.js";
import type { TelemetrySnapshot } from "../../src/telemetry/metrics.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const SECRET = "observability-routes-secret";
const jwt = createJwt(SECRET);
const alice = `Bearer ${jwt.sign({ userId: "u_alice", role: "user" })}`;
const admin = `Bearer ${jwt.sign({ userId: "u_admin", role: "admin" })}`;

function metrics(researchTokens: number, researchCalls: number): Metrics {
  return {
    perPhase: {
      research: { tokens: researchTokens, latencyMs: 0, calls: researchCalls },
      build: { tokens: 0, latencyMs: 0, calls: 0 },
      refine: { tokens: 0, latencyMs: 0, calls: 0 },
    },
    errorRate: 0,
  };
}

function webpage(title: string): Webpage {
  return { title, html: "<p>x</p>", css: "", summary: "s", sourcesUsed: [] };
}

function stubSnapshot(): TelemetrySnapshot {
  return {
    http: { count: 1, avg: 100, p95: 100, min: 100, max: 100 },
    runDuration: { count: 1, avg: 5000, p95: 5000, min: 5000, max: 5000 },
    phaseDurations: {
      research: { count: 1, avg: 1500, p95: 1500, min: 1500, max: 1500 },
      build: { count: 1, avg: 2500, p95: 2500, min: 2500, max: 2500 },
      refine: { count: 0, avg: 0, p95: 0, min: 0, max: 0 },
    },
    runAttempts: {
      research: { count: 1, avg: 2, p95: 2, min: 2, max: 2 },
      refine: { count: 0, avg: 0, p95: 0, min: 0, max: 0 },
    },
    checkpointScores: {},
    errorsByType: { timeout: 1 },
    checkpointFailuresByGate: {},
    outcomesByStatus: { published: 1, failed: 1 },
    tokens: { total: 1700, cachedInput: 0, byPhase: {} },
    runsActive: 0,
  };
}

describe("observability routes", () => {
  let app: Express;
  const T = () => "2026-06-13T00:00:00.000Z";

  beforeEach(() => {
    const db: DB = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));

    const runs = createRunStore(db, T);
    const metricStore = createMetricStore(db, undefined, T);
    const webpages = createWebpageStore(db, undefined, T);

    runs.create({
      id: "r_alice",
      personaId: "p1",
      concept: "Alice",
      workerId: "mock",
      userId: "u_alice",
    });
    runs.updateStatus("r_alice", "published");
    metricStore.insert("r_alice", metrics(1700, 2));
    webpages.insert("r_alice", 1, webpage("Alice's Page"), true);

    runs.create({
      id: "r_bob",
      personaId: "p2",
      concept: "Bob",
      workerId: "mock",
      userId: "u_bob",
    });
    runs.updateStatus("r_bob", "failed");
    metricStore.insert("r_bob", metrics(300, 1));

    const service = createObservabilityService({
      runStore: runs,
      metricStore,
      webpageStore: webpages,
      db,
      telemetrySnapshot: stubSnapshot,
    });

    app = createApp({
      corsOrigin: "*",
      version: "test",
      routers: [
        {
          path: "/me/observability",
          router: meObservabilityRouter({ service, jwtSecret: SECRET }),
        },
        {
          path: "/admin/observability",
          router: adminObservabilityRouter({ service, jwtSecret: SECRET }),
        },
      ],
    });
  });

  describe("GET /me/observability", () => {
    it("should 401 without a Bearer token", async () => {
      const res = await request(app).get("/me/observability");
      expect(res.status).toBe(401);
    });

    it("should return 200 with the caller's scoped snapshot shape", async () => {
      const res = await request(app)
        .get("/me/observability")
        .set("Authorization", alice);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        totalTokensPublished: 1700,
        perArticle: [
          {
            runId: "r_alice",
            title: "Alice's Page",
            tokens: 1700,
            status: "published",
          },
        ],
        researchLoopCount: 2,
        publishedCount: 1,
        failedCount: 0,
      });
    });
  });

  describe("GET /admin/observability", () => {
    it("should 401 without a Bearer token", async () => {
      const res = await request(app).get("/admin/observability");
      expect(res.status).toBe(401);
    });

    it("should 403 for a non-admin caller", async () => {
      const res = await request(app)
        .get("/admin/observability")
        .set("Authorization", alice);
      expect(res.status).toBe(403);
    });

    it("should return 200 with the composed aggregate + OTel snapshot for admin", async () => {
      const res = await request(app)
        .get("/admin/observability")
        .set("Authorization", admin);
      expect(res.status).toBe(200);
      expect(res.body.tokenTotals).toBe(2000);
      expect(res.body.publishedCount).toBe(1);
      expect(res.body.rejectedCount).toBe(1);
      expect(res.body.rejectedRatio).toBeCloseTo(0.5, 5);
      // Flattened from the OTel snapshot for the admin page contract.
      expect(res.body.latency).toEqual({ avgMs: 100, p95Ms: 100 });
      expect(res.body.phaseDurations).toEqual({
        research: 1500,
        build: 2500,
        refine: 0,
      });
      expect(res.body.errorsByType).toEqual({ timeout: 1 });
    });
  });
});
