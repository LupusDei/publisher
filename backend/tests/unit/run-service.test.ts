import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { MockAgent } from "../../src/agent/mock-agent.js";
import { createFileSink } from "../../src/material/sink.js";
import { composeRunDeps } from "../../src/composition.js";
import {
  createRunService,
  InputRejectedError,
} from "../../src/services/run.service.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const VOICE_SAMPLE =
  "Here's the idea, plainly. You already feel this. In plain terms — no jargon, no hedging.";

describe("createRunService", () => {
  let db: DB;
  let personaId: string;
  let service: ReturnType<typeof createRunService>;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
    const publishDir = mkdtempSync(join(tmpdir(), "publisher-svc-"));
    const { deps, personaStore } = composeRunDeps({
      db,
      agent: new MockAgent(),
      sink: createFileSink({ dir: publishDir, baseUrl: "" }),
      defaultWorkerId: "mock",
    });
    personaId = personaStore.create({
      name: "The Essayist",
      voice: "warm, plain",
      voiceSample: VOICE_SAMPLE,
      stylePoints: ["plain terms", "no jargon"],
      keyLearnings: [],
      designElements: {},
    }).id;
    service = createRunService(deps);
  });

  it("should start a run to a published outcome (happy path)", async () => {
    const { runId, outcome } = await service.start({
      personaId,
      concept: "On Emergence",
    });
    expect(typeof runId).toBe("string");
    expect(outcome.status).toBe("published");
    expect(service.get(runId)?.status).toBe("published");
  });

  it("should reject an unknown persona with InputRejectedError (error path)", async () => {
    await expect(
      service.start({ personaId: "nope", concept: "On Emergence" }),
    ).rejects.toBeInstanceOf(InputRejectedError);
  });

  it("should return the journal, and a sinceSeq slice (edge — replay)", async () => {
    const { runId } = await service.start({
      personaId,
      concept: "On Emergence",
    });
    const all = service.events(runId);
    expect(all.length).toBeGreaterThan(0);
    const since = service.events(runId, 1);
    expect(since.every((e) => e.seq > 1)).toBe(true);
  });
});
