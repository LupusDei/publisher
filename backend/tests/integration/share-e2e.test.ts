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
 * share.5.2 — whole-capability end-to-end regression guard for the
 * shareable-preview-URL feature. This is NOT a per-route unit slice; it drives a
 * mock-agent run all the way to a PUBLISHED page on disk, then exercises the
 * FULL share lifecycle through the real router + real stores + real service + a
 * real on-disk Sink, mounted in one Express app exactly as production wires it:
 *
 *   1. POST   /runs/:id/share  → 200 {slug,url}   (mint)
 *   2. GET    /p/:slug         → 200 text/html    (anonymous serve)
 *   3. DELETE /runs/:id/share  → 204              (revoke)
 *   4. GET    /p/:slug         → 404              (revoke honored, no oracle)
 *
 * If any seam in mint → serve → revoke regresses, this single test fails. No
 * network is touched (createApp + supertest), satisfying SC-005.
 */
const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

// A self-contained generated page — the exact kind of artifact a real run's
// Sink writes for an approved/published concept.
const PUBLISHED_HTML =
  "<!doctype html><html><head><title>On Emergence</title></head>" +
  "<body><h1>On Emergence</h1><p>A shared preview page.</p></body></html>";

const SECRET = "share-e2e-secret";
const jwt = createJwt(SECRET);
const ownerToken = jwt.sign({ userId: "u_owner", role: "user" });

interface Built {
  app: Express;
  runId: string;
}

/**
 * Build a real app whose run has been driven (mock worker) to a PUBLISHED state
 * with its self-contained HTML on disk — the precondition for sharing.
 */
function build(): Built {
  const db: DB = openDb(":memory:");
  runMigrations(db, loadMigrations(migrationsDir));
  const publishDir = mkdtempSync(join(tmpdir(), "publisher-share-e2e-"));
  const sink = createFileSink({ dir: publishDir, baseUrl: "" });

  const runStore = createRunStore(db, () => "2026-06-13T00:00:00.000Z");
  // A mock-agent run carried through to PUBLISHED (the gallery state from which
  // a user mints a share), with its generated page written to the Sink.
  const runId = "run_emergence";
  runStore.create({
    id: runId,
    personaId: "p_1",
    concept: "On Emergence",
    workerId: "mock",
    userId: "u_owner",
  });
  runStore.updateStatus(runId, "published");
  writeFileSync(join(publishDir, `${runId}.html`), PUBLISHED_HTML, "utf8");

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
    // A ≥16-char url-safe slug matching the real generator's shape, so the slug
    // satisfies the public route's gate and the tightened ShareSchema.
    slug: (() => {
      let n = 0;
      return () => `e2eSlug_${(n += 1).toString().padStart(16, "0")}`;
    })(),
    baseUrl: "",
  });

  // Mount BOTH surfaces in one app, exactly as production composes them: the
  // authed mint/revoke router under /runs and the public serve router at /p.
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
  return { app, runId };
}

describe("share lifecycle (e2e)", () => {
  let ctx: Built;
  beforeEach(() => {
    ctx = build();
  });

  it("should mint → serve → revoke → 404 across the full lifecycle (whole-capability guard)", async () => {
    // 1. MINT: owner shares the published run → 200 {slug,url}.
    const minted = await request(ctx.app)
      .post(`/runs/${ctx.runId}/share`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(minted.status).toBe(200);
    const { slug, url } = minted.body as { slug: string; url: string };
    expect(slug).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(url).toBe(`/p/${slug}`);

    // 2. SERVE: an anonymous browser (no auth) loads the page as text/html.
    const served = await request(ctx.app).get(`/p/${slug}`);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toMatch(/text\/html/);
    expect(served.text).toBe(PUBLISHED_HTML);

    // 3. REVOKE: the owner revokes the active share → 204.
    const revoked = await request(ctx.app)
      .delete(`/runs/${ctx.runId}/share`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(revoked.status).toBe(204);

    // 4. GONE: the public route now 404s — revoke honored within the same
    // request cycle, indistinguishable from a never-existed slug (no oracle).
    const afterRevoke = await request(ctx.app).get(`/p/${slug}`);
    expect(afterRevoke.status).toBe(404);
  });
});
