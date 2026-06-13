import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createShareStore } from "../../src/stores/share.store.js";
import { createShareService } from "../../src/services/share.service.js";
import { shareRouter } from "../../src/routes/share.js";
import { createJwt } from "../../src/auth/jwt.js";

/**
 * share.2.2 — POST /runs/:id/share is a THIN authed handler over the share
 * service: auth (401), ownership (403), published gate (409), success (200
 * {slug,url}). These integration tests drive the real router + real stores +
 * real service through a real Express app (createApp), proving the wiring end
 * to end without a network.
 */
const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const SECRET = "share-mint-secret";
const jwt = createJwt(SECRET);
const ownerToken = jwt.sign({ userId: "u_owner", role: "user" });
const otherToken = jwt.sign({ userId: "u_other", role: "user" });

interface Built {
  app: Express;
  publishedRunId: string;
  draftRunId: string;
}

function build(): Built {
  const db: DB = openDb(":memory:");
  runMigrations(db, loadMigrations(migrationsDir));

  const runStore = createRunStore(db, () => "2026-06-13T00:00:00.000Z");
  // An owned, PUBLISHED run (shareable).
  runStore.create({
    id: "run_pub",
    personaId: "p_1",
    concept: "On Emergence",
    workerId: "mock",
    userId: "u_owner",
  });
  runStore.updateStatus("run_pub", "published");
  // An owned run still building (NOT shareable → 409).
  runStore.create({
    id: "run_draft",
    personaId: "p_1",
    concept: "Half-baked",
    workerId: "mock",
    userId: "u_owner",
  });

  const shareStore = createShareStore(
    db,
    () => "2026-06-13T00:00:00.000Z",
    (() => {
      let n = 0;
      return () => `share_${(n += 1)}`;
    })(),
  );
  const shareService = createShareService({
    shareStore,
    runStore,
    slug: (() => {
      let n = 0;
      return () => `mintslug_${(n += 1).toString().padStart(12, "0")}`;
    })(),
    baseUrl: "",
  });

  const app = createApp({
    corsOrigin: "*",
    version: "test",
    routers: [
      {
        path: "/runs",
        router: shareRouter({ shareService, runStore, jwtSecret: SECRET }),
      },
    ],
  });
  return { app, publishedRunId: "run_pub", draftRunId: "run_draft" };
}

describe("POST /runs/:id/share", () => {
  let ctx: Built;
  beforeEach(() => {
    ctx = build();
  });

  it("should return 200 {slug,url} for an owned published run (success)", async () => {
    const res = await request(ctx.app)
      .post(`/runs/${ctx.publishedRunId}/share`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.slug).toMatch(/^[A-Za-z0-9_-]{12,}$/);
    expect(res.body.url).toBe(`/p/${res.body.slug}`);
  });

  it("should be idempotent — a 2nd call returns the same slug (success)", async () => {
    const first = await request(ctx.app)
      .post(`/runs/${ctx.publishedRunId}/share`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const second = await request(ctx.app)
      .post(`/runs/${ctx.publishedRunId}/share`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(second.status).toBe(200);
    expect(second.body.slug).toBe(first.body.slug);
  });

  it("should return 401 when unauthenticated (error)", async () => {
    const res = await request(ctx.app).post(
      `/runs/${ctx.publishedRunId}/share`,
    );
    expect(res.status).toBe(401);
  });

  it("should return 403 when the caller does not own the run (error)", async () => {
    const res = await request(ctx.app)
      .post(`/runs/${ctx.publishedRunId}/share`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("should return 409 when the run is not published (error)", async () => {
    const res = await request(ctx.app)
      .post(`/runs/${ctx.draftRunId}/share`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(409);
  });
});
