import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createShareStore } from "../../src/stores/share.store.js";
import { createShareService } from "../../src/services/share.service.js";
import { createFileSink } from "../../src/material/sink.js";
import { shareRouter, publicShareRouter } from "../../src/routes/share.js";
import { createJwt } from "../../src/auth/jwt.js";

/**
 * share.4.2 — DELETE /runs/:id/share is a THIN authed handler over the share
 * service: auth, ownership (403 non-owner), revoke → 204, and an idempotent 204
 * no-op when there is no active share. These integration tests drive the real
 * router + real stores + real service + a real on-disk Sink through a real
 * Express app, and — critically — mount the PUBLIC /p router too so we prove the
 * revoke is honored end-to-end (DELETE → then GET /p/:slug 404, no oracle).
 */
const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const PUBLISHED_HTML =
  "<!doctype html><html><head><title>Shared</title></head><body><h1>Hi</h1></body></html>";

const SECRET = "share-revoke-secret";
const jwt = createJwt(SECRET);
const ownerToken = jwt.sign({ userId: "u_owner", role: "user" });
const otherToken = jwt.sign({ userId: "u_other", role: "user" });

interface Built {
  app: Express;
  ownedRunId: string;
  noShareRunId: string;
}

function build(): Built {
  const db: DB = openDb(":memory:");
  runMigrations(db, loadMigrations(migrationsDir));
  const publishDir = mkdtempSync(join(tmpdir(), "publisher-share-revoke-"));
  const sink = createFileSink({ dir: publishDir, baseUrl: "" });

  const runStore = createRunStore(db, () => "2026-06-13T00:00:00.000Z");
  // An owned, PUBLISHED run that WILL be shared then revoked.
  runStore.create({
    id: "run_pub",
    personaId: "p_1",
    concept: "On Emergence",
    workerId: "mock",
    userId: "u_owner",
  });
  runStore.updateStatus("run_pub", "published");
  // An owned, PUBLISHED run that is NEVER shared (DELETE → 204 no-op).
  runStore.create({
    id: "run_noshare",
    personaId: "p_1",
    concept: "Never shared",
    workerId: "mock",
    userId: "u_owner",
  });
  runStore.updateStatus("run_noshare", "published");
  writeFileSync(join(publishDir, "run_pub.html"), PUBLISHED_HTML, "utf8");

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
      { path: "/p", router: publicShareRouter({ shareService, sink }) },
    ],
  });
  return { app, ownedRunId: "run_pub", noShareRunId: "run_noshare" };
}

/** Mint a share for `runId` as the owner and return its slug. */
async function mint(ctx: Built, runId: string): Promise<string> {
  const res = await request(ctx.app)
    .post(`/runs/${runId}/share`)
    .set("Authorization", `Bearer ${ownerToken}`);
  expect(res.status).toBe(200);
  return res.body.slug as string;
}

describe("DELETE /runs/:id/share", () => {
  let ctx: Built;
  beforeEach(() => {
    ctx = build();
  });

  it("should revoke the owner's active share → 204, after which GET /p/:slug 404s (end-to-end)", async () => {
    const slug = await mint(ctx, ctx.ownedRunId);
    // sanity: the public page is reachable before revoke
    const before = await request(ctx.app).get(`/p/${slug}`);
    expect(before.status).toBe(200);

    const del = await request(ctx.app)
      .delete(`/runs/${ctx.ownedRunId}/share`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(del.status).toBe(204);

    // the public route now 404s — revoke honored within the same request cycle
    const after = await request(ctx.app).get(`/p/${slug}`);
    expect(after.status).toBe(404);
  });

  it("should return 403 when a non-owner tries to revoke (error)", async () => {
    const slug = await mint(ctx, ctx.ownedRunId);
    const del = await request(ctx.app)
      .delete(`/runs/${ctx.ownedRunId}/share`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(del.status).toBe(403);
    // the share is untouched — still publicly reachable
    const after = await request(ctx.app).get(`/p/${slug}`);
    expect(after.status).toBe(200);
  });

  it("should return 204 (idempotent no-op) when there is no active share (edge case)", async () => {
    const del = await request(ctx.app)
      .delete(`/runs/${ctx.noShareRunId}/share`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(del.status).toBe(204);
  });

  it("should be idempotent — a 2nd revoke also returns 204 (edge case)", async () => {
    await mint(ctx, ctx.ownedRunId);
    const first = await request(ctx.app)
      .delete(`/runs/${ctx.ownedRunId}/share`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(first.status).toBe(204);
    const second = await request(ctx.app)
      .delete(`/runs/${ctx.ownedRunId}/share`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(second.status).toBe(204);
  });

  it("should return 401 when unauthenticated (error)", async () => {
    const res = await request(ctx.app).delete(
      `/runs/${ctx.ownedRunId}/share`,
    );
    expect(res.status).toBe(401);
  });
});
