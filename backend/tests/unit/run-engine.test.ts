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
  RunEvent,
  Validator,
  Webpage,
} from "@publisher/shared";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createPersonaStore } from "../../src/stores/persona.store.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createRunEventStore } from "../../src/stores/run-event.store.js";
import { createWebpageStore } from "../../src/stores/webpage.store.js";
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

function usage(total = 10) {
  return {
    inputTokens: total / 2,
    outputTokens: total / 2,
    totalTokens: total,
  };
}

function makeEngine(db: DB, agent: Agent, opts: { maxAttempts?: number } = {}) {
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
  const publishDir = mkdtempSync(join(tmpdir(), "publisher-engine-"));
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
    checkpointStore: createCheckpointStore(db),
    alarmStore: createAlarmStore(db),
    metricStore: createMetricStore(db),
    escalationStore: createEscalationStore(db),
    ...(opts.maxAttempts ? { maxAttempts: opts.maxAttempts } : {}),
  });
}

function load(db: DB, runId: string): RunEvent[] {
  return createRunEventStore(db).load(runId);
}

/** An agent whose research always returns too few sources (gate 1 fails). */
const thinResearchAgent: Agent = {
  async research(): Promise<AgentResult<ResearchResult>> {
    return {
      value: { text: "thin", sources: ["https://only-one.example"] },
      usage: usage(),
      finishReason: "stop",
    };
  },
  async build(): Promise<AgentResult<Webpage>> {
    throw new Error("build should never be called when research is thin");
  },
};

/** An agent that always builds off-voice (voice gate never passes). */
function alwaysOffVoiceAgent(): Agent {
  const offVoice: Webpage = {
    title: "A Treatise Heretofore",
    html: "<main><h1>Furthermore</h1><p>The aforementioned scholarly treatise, pursuant to convention, warrants exhaustive formal elaboration herein at length and detail.</p></main>",
    css: "",
    summary:
      "A formal academic treatment of the subject in a detached register.",
    sourcesUsed: ["a", "b", "c"],
  };
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
        usage: usage(),
        finishReason: "stop",
      };
    },
    async build(): Promise<AgentResult<Webpage>> {
      return { value: offVoice, usage: usage(), finishReason: "stop" };
    },
  };
}

/** An agent whose research throws — a true fault (D7 → PROVIDER_ERROR). */
const faultingAgent: Agent = {
  async research(): Promise<AgentResult<ResearchResult>> {
    throw new Error("provider exploded");
  },
  async build(): Promise<AgentResult<Webpage>> {
    throw new Error("unused");
  },
};

describe("RunEngine.start", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
  });

  it("should run the R2 loop to published with the scripted MockAgent (happy path)", async () => {
    const engine = makeEngine(db, new MockAgent());
    const outcome = await engine.start({
      runId: "run_1",
      material,
      workerId: "mock",
    });
    expect(outcome.status).toBe("published");
    const events = load(db, "run_1");
    expect(events[events.length - 1]?.t).toBe("published");
    // Per-run metrics were recorded (D9): at least one metric event.
    expect(events.some((e) => e.t === "metric")).toBe(true);
  });

  it("should escalate (not publish) when research is insufficient (error path)", async () => {
    const engine = makeEngine(db, thinResearchAgent);
    const outcome = await engine.start({
      runId: "run_2",
      material,
      workerId: "mock",
    });
    expect(outcome.status).toBe("escalated");
    const events = load(db, "run_2");
    expect(events.some((e) => e.t === "escalation")).toBe(true);
    // The build phase never ran (no draft event).
    expect(events.some((e) => e.t === "draft")).toBe(false);
  });

  it("should escalate after exhausting attempts when the voice gate keeps failing (edge)", async () => {
    const engine = makeEngine(db, alwaysOffVoiceAgent(), { maxAttempts: 2 });
    const outcome = await engine.start({
      runId: "run_3",
      material,
      workerId: "mock",
    });
    expect(outcome.status).toBe("escalated");
    const events = load(db, "run_3");
    const drafts = events.filter((e) => e.t === "draft");
    // Two attempts were made before escalating.
    const attempts = new Set(
      drafts.map((e) => (e.t === "draft" ? e.attempt : 0)),
    );
    expect(attempts).toEqual(new Set([1, 2]));
  });

  it("should fail the run and emit a PROVIDER_ERROR alarm on an agent fault (D7)", async () => {
    const engine = makeEngine(db, faultingAgent);
    const outcome = await engine.start({
      runId: "run_4",
      material,
      workerId: "mock",
    });
    expect(outcome.status).toBe("failed");
    const events = load(db, "run_4");
    expect(events[events.length - 1]?.t).toBe("failed");
    const alarmTypes = events.flatMap((e) =>
      e.t === "alarm" ? [e.alarm.type] : [],
    );
    expect(alarmTypes).toContain("PROVIDER_ERROR");
  });
});

describe("RunEngine.resume", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
  });

  it("should publish the last draft on approve_anyway (HITL override)", async () => {
    const engine = makeEngine(db, alwaysOffVoiceAgent(), { maxAttempts: 1 });
    const started = await engine.start({
      runId: "run_5",
      material,
      workerId: "mock",
    });
    expect(started.status).toBe("escalated");
    if (started.status !== "escalated") return;
    const outcome = await engine.resume("run_5", {
      escalationId: started.escalation.id,
      choice: "approve_anyway",
    });
    expect(outcome.status).toBe("published");
    const events = load(db, "run_5");
    expect(events.some((e) => e.t === "resumed")).toBe(true);
    expect(events[events.length - 1]?.t).toBe("published");
  });

  it("should recompile guardrails and re-run on enrich_persona, then publish (D19)", async () => {
    // Start with a persona whose voiceSample does NOT match the on-voice draft,
    // so attempt-1 (MockAgent off-voice) fails AND attempt-2 (on-voice) still
    // fails the voice gate → escalation. Then enrich with a matching sample and
    // resume: the on-voice draft now passes under the recompiled guardrails.
    const mismatched: Persona = {
      ...persona,
      voiceSample:
        "Quarterly synergy leverage paradigm stakeholder ROI verticals.",
    };
    const engine = makeEngine(db, new MockAgent());
    const started = await engine.start({
      runId: "run_6",
      material: { concept: "On Emergence", persona: mismatched },
      workerId: "mock",
    });
    expect(started.status).toBe("escalated");
    if (started.status !== "escalated") return;

    const outcome = await engine.resume("run_6", {
      escalationId: started.escalation.id,
      choice: "enrich_persona",
      payload: { persona: { ...mismatched, voiceSample: VOICE_SAMPLE } },
    });
    expect(outcome.status).toBe("published");
    const events = load(db, "run_6");
    const resumed = events.find((e) => e.t === "resumed");
    expect(resumed?.t).toBe("resumed");
    expect(events[events.length - 1]?.t).toBe("published");
  });

  it("should throw RunNotPausedError when resuming a run that is not paused (edge)", async () => {
    const engine = makeEngine(db, new MockAgent());
    await expect(
      engine.resume("run_unknown", {
        escalationId: "x",
        choice: "approve_anyway",
      }),
    ).rejects.toThrow(/not paused/);
  });

  it("should fail the run on abort (interface-only path, D19)", async () => {
    const engine = makeEngine(db, alwaysOffVoiceAgent(), { maxAttempts: 1 });
    const started = await engine.start({
      runId: "run_7",
      material,
      workerId: "mock",
    });
    if (started.status !== "escalated") throw new Error("expected escalation");
    const outcome = await engine.resume("run_7", {
      escalationId: started.escalation.id,
      choice: "abort",
    });
    expect(outcome.status).toBe("failed");
  });
});
