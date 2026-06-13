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
import { createRunService } from "../../src/services/run.service.js";
import type { Agent } from "../../src/domain/index.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const VOICE_SAMPLE =
  "Here's the idea, plainly. You already feel this. In plain terms — no jargon, no hedging.";

/**
 * rrt.2.2 — the server.ts composition path. server.ts replaces the single
 * startup agent with an `agentFactory` passed to composeRunDeps, so each run
 * builds the agent for ITS OWN workerId. These tests exercise that exact
 * composition (composeRunDeps + createRunService) with a spy factory and prove
 * the run's workerId — not a hardcoded one — drives agent creation.
 */
describe("run composition via agentFactory (rrt.2.2)", () => {
  let db: DB;
  let personaId: string;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
    const personaStore = composeRunDeps({
      db,
      // A factory is required for this composition; reuse it to author a persona.
      agentFactory: () => new MockAgent(),
      sink: createFileSink({
        dir: mkdtempSync(join(tmpdir(), "publisher-svc-ws-")),
        baseUrl: "",
      }),
    }).personaStore;
    personaId = personaStore.create({
      name: "The Essayist",
      voice: "warm, plain",
      voiceSample: VOICE_SAMPLE,
      stylePoints: ["plain terms", "no jargon"],
      keyLearnings: [],
      designElements: {},
    }).id;
  });

  function serviceWithFactory(
    factory: (workerId: string) => Agent,
    personaStore?: ReturnType<typeof composeRunDeps>["personaStore"],
  ) {
    const composed = composeRunDeps({
      db,
      agentFactory: factory,
      sink: createFileSink({
        dir: mkdtempSync(join(tmpdir(), "publisher-svc-ws2-")),
        baseUrl: "",
      }),
      ...(personaStore ? { personaStore } : {}),
    });
    return createRunService(composed.deps);
  }

  it("should build the agent for the run's workerId, not a hardcoded one (happy path)", async () => {
    const seen: string[] = [];
    const service = serviceWithFactory((workerId) => {
      seen.push(workerId);
      return new MockAgent();
    });
    const { runId } = await service.start({
      personaId,
      concept: "On Emergence",
      workerId: "sonnet",
    });
    await service.waitFor(runId);
    expect(seen).toContain("sonnet");
    expect(seen).not.toContain("opus");
  });

  it("should select different workers across runs (the swap is per-run, error/isolation path)", async () => {
    const seen: string[] = [];
    const service = serviceWithFactory((workerId) => {
      seen.push(workerId);
      return new MockAgent();
    });
    const a = await service.start({
      personaId,
      concept: "Run A",
      workerId: "opus",
    });
    const b = await service.start({
      personaId,
      concept: "Run B",
      workerId: "sonnet",
    });
    await service.waitFor(a.runId);
    await service.waitFor(b.runId);
    expect(seen).toContain("opus");
    expect(seen).toContain("sonnet");
  });

  it("should require agent or agentFactory in composeRunDeps (edge — misconfiguration)", () => {
    expect(() =>
      composeRunDeps({
        db,
        sink: createFileSink({
          dir: mkdtempSync(join(tmpdir(), "publisher-svc-ws3-")),
          baseUrl: "",
        }),
      }),
    ).toThrow(/agent.*agentFactory/i);
  });
});
