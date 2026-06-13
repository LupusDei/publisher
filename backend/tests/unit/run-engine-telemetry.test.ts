import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentResult,
  Material,
  Persona,
  ResearchResult,
  Validator,
  Webpage,
} from "@publisher/shared";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createPersonaStore } from "../../src/stores/persona.store.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createRunEventStore } from "../../src/stores/run-event.store.js";
import { createWebpageStore } from "../../src/stores/webpage.store.js";
import { createResearchStore } from "../../src/stores/research.store.js";
import { createCheckpointStore } from "../../src/stores/checkpoint.store.js";
import { createAlarmStore } from "../../src/stores/alarm.store.js";
import { createMetricStore } from "../../src/stores/metric.store.js";
import { createEscalationStore } from "../../src/stores/escalation.store.js";
import { createFileSink } from "../../src/material/sink.js";
import { createGuardrailEngine } from "../../src/guardrails/index.js";
import { createCheckpoints } from "../../src/checkpoints/index.js";
import { createJournal } from "../../src/journal/index.js";
import { createEventBus } from "../../src/orchestrator/event-bus.js";
import { createRunEngine } from "../../src/orchestrator/run-engine.js";
import type { Agent } from "../../src/domain/index.js";
import { MockAgent } from "../../src/agent/mock-agent.js";
import {
  createTelemetry,
  type Telemetry,
} from "../../src/telemetry/metrics.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const VOICE_SAMPLE =
  "Here's the idea, plainly. You already feel this. In plain terms — no jargon, no hedging.";

const persona: Persona = {
  id: "p_1",
  name: "The Essayist",
  voice: "warm, plain",
  voiceSample: VOICE_SAMPLE,
  stylePoints: ["plain terms", "no jargon"],
  keyLearnings: [],
  designElements: {},
};

const material: Material = { concept: "On Emergence", persona };

function usage(total = 10, cachedInputTokens?: number) {
  return {
    inputTokens: total / 2,
    outputTokens: total / 2,
    totalTokens: total,
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
  };
}

function makeEngine(
  db: DB,
  agent: Agent,
  telemetry: Telemetry,
  opts: { maxAttempts?: number } = {},
) {
  const personaStore = createPersonaStore(db);
  personaStore.create({
    name: persona.name,
    voice: persona.voice,
    voiceSample: persona.voiceSample,
    stylePoints: persona.stylePoints,
    keyLearnings: persona.keyLearnings,
    designElements: persona.designElements,
  });
  const eventStore = createRunEventStore(db);
  const publishDir = mkdtempSync(join(tmpdir(), "publisher-engine-tel-"));
  return createRunEngine({
    agent,
    sink: createFileSink({ dir: publishDir, baseUrl: "" }),
    guardrailEngine: createGuardrailEngine(),
    buildCheckpoints: (validators: (p: Persona) => Validator[]) =>
      createCheckpoints({ validators }),
    journal: createJournal(eventStore),
    eventBus: createEventBus(),
    runStore: createRunStore(db),
    webpageStore: createWebpageStore(db),
    researchStore: createResearchStore(db),
    checkpointStore: createCheckpointStore(db),
    alarmStore: createAlarmStore(db),
    metricStore: createMetricStore(db),
    escalationStore: createEscalationStore(db),
    telemetry,
    ...(opts.maxAttempts ? { maxAttempts: opts.maxAttempts } : {}),
  });
}

/** Research throws → a true fault (D7 → PROVIDER_ERROR). */
const faultingAgent: Agent = {
  async research(): Promise<AgentResult<ResearchResult>> {
    throw new Error("provider exploded");
  },
  async build(): Promise<AgentResult<Webpage>> {
    throw new Error("unused");
  },
};

/** Builds on-voice with cached-input usage on the build call. */
function cachedTokenAgent(): Agent {
  return {
    async research(): Promise<AgentResult<ResearchResult>> {
      return {
        value: {
          text: "ok",
          sources: [
            "https://a.example",
            "https://b.example",
            "https://c.example",
          ],
        },
        usage: usage(10),
        finishReason: "stop",
      };
    },
    async build(): Promise<AgentResult<Webpage>> {
      return {
        value: {
          title: "Built",
          html: "<main><h1>Built</h1><p>body</p></main>",
          css: "",
          summary: "s",
          sourcesUsed: ["a", "b", "c"],
        },
        usage: usage(20, 8),
        finishReason: "stop",
      };
    },
  };
}

describe("RunEngine telemetry instrumentation", () => {
  let db: DB;
  let telemetry: Telemetry;
  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
    // A fresh aggregating instance per test (its OTel instruments are no-ops).
    telemetry = createTelemetry();
  });

  it("should record phase durations, tokens, scores, outcome and keep the run active at the approval gate, then end on publish", async () => {
    const engine = makeEngine(db, new MockAgent(), telemetry);

    const started = await engine.start({
      runId: "run_tel_1",
      material,
      workerId: "w-mock",
    });
    expect(started.status).toBe("awaiting_approval");
    if (started.status !== "awaiting_approval") return;

    const atGate = telemetry.snapshot();
    // Reached the approval gate → outcome recorded, run still counted active
    // (runEnded NOT called for awaiting_approval).
    expect(atGate.outcomesByStatus.awaiting_approval).toBe(1);
    expect(atGate.runsActive).toBe(1);
    // Per-phase durations recorded for research + build (at least one each).
    expect(atGate.phaseDurations.research.count).toBeGreaterThanOrEqual(1);
    expect(atGate.phaseDurations.build.count).toBeGreaterThanOrEqual(1);
    // Tokens mirrored for both phases.
    expect(atGate.tokens.total).toBeGreaterThan(0);
    expect(atGate.tokens.byPhase.research).toBeGreaterThan(0);
    expect(atGate.tokens.byPhase.build).toBeGreaterThan(0);
    // Research ran exactly once → attempts recorded.
    expect(atGate.runAttempts.research.count).toBe(1);
    expect(atGate.runAttempts.research.max).toBe(1);
    // Refine-loop exit recorded (attempt 1 cleared all gates).
    expect(atGate.runAttempts.refine.count).toBe(1);
    // Run-duration recorded at the approval gate.
    expect(atGate.runDuration.count).toBe(1);
    // Checkpoint scores recorded for the gates that produced a score.
    expect(Object.keys(atGate.checkpointScores).length).toBeGreaterThan(0);

    // Approve → publish → outcome + runEnded.
    const outcome = await engine.resume("run_tel_1", {
      escalationId: started.escalation.id,
      choice: "approve_anyway",
    });
    expect(outcome.status).toBe("published");

    const afterPublish = telemetry.snapshot();
    expect(afterPublish.outcomesByStatus.published).toBe(1);
    // The held run is now released.
    expect(afterPublish.runsActive).toBe(0);
    // A second run-duration sample was recorded on the publish transition.
    expect(afterPublish.runDuration.count).toBe(2);
  });

  it("should record an error and a failed outcome on an agent fault (D7)", async () => {
    const engine = makeEngine(db, faultingAgent, telemetry);
    const outcome = await engine.start({
      runId: "run_tel_2",
      material,
      workerId: "w-fault",
    });
    expect(outcome.status).toBe("failed");

    const snap = telemetry.snapshot();
    // The mapped alarm type was recorded as an error.
    expect(snap.errorsByType.PROVIDER_ERROR).toBe(1);
    // Terminal failed outcome recorded and run released.
    expect(snap.outcomesByStatus.failed).toBe(1);
    expect(snap.runsActive).toBe(0);
    expect(snap.runDuration.count).toBe(1);
  });

  it("should mirror cached input tokens when the agent reports them (edge)", async () => {
    // maxAttempts=1 → exactly ONE build call, so the token totals below are
    // deterministic regardless of whether the draft passes the voice gate.
    const engine = makeEngine(db, cachedTokenAgent(), telemetry, {
      maxAttempts: 1,
    });
    // Outcome (publish vs escalate) is irrelevant here — both run research +
    // build under metered(), which is where cached-token mirroring happens.
    await engine.start({
      runId: "run_tel_3",
      material,
      workerId: "w-cache",
    });

    const snap = telemetry.snapshot();
    // The build call reported 8 cached input tokens.
    expect(snap.tokens.cachedInput).toBe(8);
    expect(snap.tokens.byPhase.build).toBe(20);
    expect(snap.tokens.byPhase.research).toBe(10);
  });
});
