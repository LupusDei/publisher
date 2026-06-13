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
import { publicShareRouter } from "../../src/routes/share.js";

/**
 * share.2.3 — the public GET /p/:slug route serves the run's self-contained
 * HTML with NO auth, and returns a UNIFORM 404 for unknown, malformed, revoked,
 * or missing-file cases (no oracle). These tests prove each path against a real
 * sink on disk.
 */
const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const PUBLISHED_HTML =
  "<!doctype html><html><head><title>Shared</title></head><body><h1>Hi</h1></body></html>";

interface Built {
  app: Express;
  activeSlug: string;
  revokedSlug: string;
  noFileSlug: string;
}

function build(): Built {
  const db: DB = openDb(":memory:");
  runMigrations(db, loadMigrations(migrationsDir));
  const publishDir = mkdtempSync(join(tmpdir(), "publisher-share-serve-"));
  const sink = createFileSink({ dir: publishDir, baseUrl: "" });

  const runStore = createRunStore(db, () => "2026-06-13T00:00:00.000Z");
  // run_pub has an HTML file on disk; run_nofile is published but its file is
  // missing (disk cleared) → must 404, not 500.
  for (const id of ["run_pub", "run_revoked", "run_nofile"]) {
    runStore.create({
      id,
      personaId: "p_1",
      concept: "c",
      workerId: "mock",
      userId: "u_owner",
    });
    runStore.updateStatus(id, "published");
  }
  writeFileSync(join(publishDir, "run_pub.html"), PUBLISHED_HTML, "utf8");
  writeFileSync(join(publishDir, "run_revoked.html"), PUBLISHED_HTML, "utf8");
  // deliberately do NOT write run_nofile.html

  let n = 0;
  const shareStore = createShareStore(
    db,
    () => "2026-06-13T00:00:00.000Z",
    () => `share_${(n += 1)}`,
  );
  const shareService = createShareService({
    shareStore,
    runStore,
    slug: () => "ignored",
    baseUrl: "",
  });

  const active = shareStore.create({
    slug: "activeSlug_0000000000000",
    runId: "run_pub",
    ownerId: "u_owner",
  });
  shareStore.create({
    slug: "noFileSlug_0000000000000",
    runId: "run_nofile",
    ownerId: "u_owner",
  });
  const revoked = shareStore.create({
    slug: "revokedSlug_000000000000",
    runId: "run_revoked",
    ownerId: "u_owner",
  });
  shareStore.revoke("run_revoked");

  const app = createApp({
    corsOrigin: "*",
    version: "test",
    routers: [{ path: "/p", router: publicShareRouter({ shareService, sink }) }],
  });
  return {
    app,
    activeSlug: active.slug,
    revokedSlug: revoked.slug,
    noFileSlug: "noFileSlug_0000000000000",
  };
}

describe("GET /p/:slug (public serve)", () => {
  let ctx: Built;
  beforeEach(() => {
    ctx = build();
  });

  it("should serve the run HTML as text/html with NO auth (success)", async () => {
    const res = await request(ctx.app).get(`/p/${ctx.activeSlug}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toBe(PUBLISHED_HTML);
  });

  it("should 404 for an unknown slug (uniform 404)", async () => {
    const res = await request(ctx.app).get("/p/unknownSlug_0000000000");
    expect(res.status).toBe(404);
  });

  it("should 404 for a malformed (too-short) slug (uniform 404)", async () => {
    const res = await request(ctx.app).get("/p/short");
    expect(res.status).toBe(404);
  });

  it("should 404 for a malformed slug with illegal chars (uniform 404)", async () => {
    const res = await request(ctx.app).get("/p/has.dots.and$$$badchars");
    expect(res.status).toBe(404);
  });

  it("should 404 for a revoked slug — indistinguishable from unknown (no oracle)", async () => {
    const res = await request(ctx.app).get(`/p/${ctx.revokedSlug}`);
    expect(res.status).toBe(404);
  });

  it("should 404 (not 500) when the Sink file is missing (edge case)", async () => {
    const res = await request(ctx.app).get(`/p/${ctx.noFileSlug}`);
    expect(res.status).toBe(404);
  });
});
