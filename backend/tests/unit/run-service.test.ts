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
  type RunServiceDeps,
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
  let deps: RunServiceDeps;
  let service: ReturnType<typeof createRunService>;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
    const publishDir = mkdtempSync(join(tmpdir(), "publisher-svc-"));
    const composed = composeRunDeps({
      db,
      agent: new MockAgent(),
      sink: createFileSink({ dir: publishDir, baseUrl: "" }),
      defaultWorkerId: "mock",
    });
    deps = composed.deps;
    const personaStore = composed.personaStore;
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

  it("should start a run fire-and-forget and reach published via waitFor (happy path)", async () => {
    // dp0.11: start returns the runId immediately (no outcome); the engine runs
    // in the background. waitFor resolves from the captured engine promise.
    const { runId } = await service.start({
      personaId,
      concept: "On Emergence",
    });
    expect(typeof runId).toBe("string");
    const outcome = await service.waitFor(runId);
    expect(outcome.status).toBe("published");
    expect(service.get(runId)?.status).toBe("published");
  });

  it("should return the runId before the run reaches a terminal status (async)", async () => {
    // The run is still in-flight the moment start resolves — get() shows a
    // non-terminal status, proving POST does not block on the engine.
    const { runId } = await service.start({
      personaId,
      concept: "On Emergence",
    });
    const status = service.get(runId)?.status;
    expect(status).not.toBe("published");
    // And it still finishes when we wait for it.
    await service.waitFor(runId);
    expect(service.get(runId)?.status).toBe("published");
  });

  it("should reject an unknown persona with InputRejectedError before minting a runId (error path)", async () => {
    await expect(
      service.start({ personaId: "nope", concept: "On Emergence" }),
    ).rejects.toBeInstanceOf(InputRejectedError);
  });

  it("should reject waitFor for an unknown run (edge)", async () => {
    await expect(service.waitFor("run_does-not-exist")).rejects.toThrow(
      /unknown run/i,
    );
  });

  it("should return the journal, and a sinceSeq slice (edge — replay)", async () => {
    const { runId } = await service.start({
      personaId,
      concept: "On Emergence",
    });
    await service.waitFor(runId);
    const all = service.events(runId);
    expect(all.length).toBeGreaterThan(0);
    const since = service.events(runId, 1);
    expect(since.every((e) => e.seq > 1)).toBe(true);
  });

  it("should convert a backgrounded engine fault into a failed outcome without an unhandled rejection (fault net)", async () => {
    // A buildCheckpoints that omits the research-sufficiency gate makes the
    // engine throw OUTSIDE its own fault handling — the service's guard must
    // absorb it into a terminal `failed` (never an unhandled rejection) and mark
    // the run failed. This exercises the dp0.11 fire-and-forget `.catch` net.
    const faulting = createRunService({
      ...deps,
      buildCheckpoints: () => [],
    });
    const { runId } = await faulting.start({
      personaId,
      concept: "On Emergence",
    });
    const outcome = await faulting.waitFor(runId);
    expect(outcome.status).toBe("failed");
    expect(faulting.get(runId)?.status).toBe("failed");
  });

  it("should propagate RunNotPausedError from decide for a run that is not paused (error path)", async () => {
    // A published run has nothing to resume — decide must reject so the route can
    // map it to a 409, and the run's terminal status must stay intact.
    const { runId } = await service.start({
      personaId,
      concept: "On Emergence",
    });
    await service.waitFor(runId);
    await expect(
      service.decide(runId, {
        escalationId: "nope",
        choice: "approve_anyway",
      }),
    ).rejects.toThrow(/not paused/i);
    expect(service.get(runId)?.status).toBe("published");
  });
});
