import { describe, it, expect, beforeEach } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createFileSink } from "../../src/material/sink.js";
import { MockAgent } from "../../src/agent/mock-agent.js";
import { composeRunDeps } from "../../src/composition.js";
import { createRunStore } from "../../src/stores/run.store.js";

/**
 * share.2.4 — the composition root must construct and expose a `shareStore` and
 * a `shareService` (wired to the real run store + sink + PUBLIC_BASE_URL) so
 * server.ts mounts the share routes from one graph. These tests pin that the
 * graph exposes both and that the service is wired through correctly.
 */
const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

function buildDb(): DB {
  const db = openDb(":memory:");
  runMigrations(db, loadMigrations(migrationsDir));
  return db;
}

describe("composeRunDeps — share wiring", () => {
  let db: DB;
  let sink: ReturnType<typeof createFileSink>;

  beforeEach(() => {
    db = buildDb();
    sink = createFileSink({
      dir: mkdtempSync(join(tmpdir(), "publisher-comp-")),
      baseUrl: "",
    });
  });

  it("should expose a constructed shareStore and shareService", () => {
    const comp = composeRunDeps({ db, agent: new MockAgent(), sink });
    expect(comp.shareStore).toBeDefined();
    expect(typeof comp.shareStore.create).toBe("function");
    expect(comp.shareService).toBeDefined();
    expect(typeof comp.shareService.mint).toBe("function");
    expect(typeof comp.shareService.resolveBySlug).toBe("function");
  });

  it("should wire the shareService to mint a real share for an owned published run", () => {
    const comp = composeRunDeps({ db, agent: new MockAgent(), sink });
    const runStore = createRunStore(db);
    runStore.create({
      id: "run_pub",
      personaId: "p_1",
      concept: "c",
      workerId: "mock",
      userId: "u_owner",
    });
    runStore.updateStatus("run_pub", "published");

    const link = comp.shareService.mint("run_pub", "u_owner");
    expect(link.slug).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(link.url).toBe(`/p/${link.slug}`);
    // resolveBySlug round-trips through the same shareStore.
    expect(comp.shareService.resolveBySlug(link.slug)).toBe("run_pub");
  });

  it("should thread a non-empty baseUrl into the minted share url", () => {
    const comp = composeRunDeps({
      db,
      agent: new MockAgent(),
      sink,
      shareBaseUrl: "https://share.example.com",
    });
    const runStore = createRunStore(db);
    runStore.create({
      id: "run_pub2",
      personaId: "p_1",
      concept: "c",
      workerId: "mock",
      userId: "u_owner",
    });
    runStore.updateStatus("run_pub2", "published");

    const link = comp.shareService.mint("run_pub2", "u_owner");
    expect(link.url).toBe(`https://share.example.com/p/${link.slug}`);
  });
});
