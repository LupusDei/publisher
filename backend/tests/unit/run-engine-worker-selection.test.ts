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

/** A passing agent that tags every output so we can prove WHICH agent ran. */
function taggedAgent(workerId: string): Agent {
  return {
    async research(): Promise<AgentResult<ResearchResult>> {
      return {
        value: {
          text: `research by ${workerId}`,
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
    async build(input): Promise<AgentResult<Webpage>> {
      // On-voice when feedback present so the run can clear the voice gate; the
      // content is irrelevant to this test — we assert via the factory spy.
      const onVoice = input.feedback !== undefined;
      return {
        value: {
          title: "Here's the idea, plainly",
          html: onVoice
            ? "<main><h1>Here's the idea, plainly</h1><p>You already feel this. In plain terms, no jargon, no hedging — here's what it means for you.</p></main>"
            : "<main><h1>Furthermore</h1><p>The aforementioned treatise warrants exhaustive scholarly elaboration herein.</p></main>",
          css: "",
          summary: `Built by ${workerId} over 3 sources.`,
          sourcesUsed: ["a", "b", "c"],
        },
        usage: usage(),
        finishReason: "stop",
      };
    },
  };
}

function makeEngineWithFactory(
  db: DB,
  agentFactory: (workerId: string | undefined) => Agent,
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
  const publishDir = mkdtempSync(join(tmpdir(), "publisher-worker-sel-"));
  return createRunEngine({
    // Per-run factory (rrt.2.1) — NO single injected agent. The engine must
    // build the agent for ctx.workerId in start().
    agentFactory,
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
  });
}

describe("RunEngine — per-run worker selection (rrt.2.1)", () => {
  let db: DB;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
  });

  it("should build the agent for the run's workerId via the factory (happy path)", async () => {
    const requested: (string | undefined)[] = [];
    const factory = (workerId: string | undefined): Agent => {
      requested.push(workerId);
      return taggedAgent(workerId ?? "?");
    };
    const engine = makeEngineWithFactory(db, factory);

    await engine.start({ runId: "run_1", material, workerId: "sonnet" });

    // The factory was consulted with THIS run's workerId, not a hardcoded one.
    expect(requested).toContain("sonnet");
  });

  it("should use distinct agents for distinct runs' workerIds (isolation)", async () => {
    const requested: (string | undefined)[] = [];
    const factory = (workerId: string | undefined): Agent => {
      requested.push(workerId);
      return taggedAgent(workerId ?? "?");
    };
    const engine = makeEngineWithFactory(db, factory);

    await engine.start({ runId: "run_a", material, workerId: "opus" });
    await engine.start({ runId: "run_b", material, workerId: "sonnet" });

    expect(requested).toContain("opus");
    expect(requested).toContain("sonnet");
  });

  it("rrt.6: researches via the research worker, builds via the picked model", async () => {
    const researchBy: string[] = [];
    const buildBy: string[] = [];
    const factory = (workerId: string | undefined): Agent => {
      const id = workerId ?? "?";
      return {
        async research(): Promise<AgentResult<ResearchResult>> {
          researchBy.push(id);
          return {
            value: {
              text: `research by ${id}`,
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
        async build(input): Promise<AgentResult<Webpage>> {
          buildBy.push(id);
          const onVoice = input.feedback !== undefined;
          return {
            value: {
              title: "Here's the idea, plainly",
              html: onVoice
                ? "<main><h1>Here's the idea, plainly</h1><p>You already feel this. In plain terms, no jargon, no hedging — here's what it means for you.</p></main>"
                : "<main><h1>Furthermore</h1><p>The aforementioned treatise warrants exhaustive scholarly elaboration herein.</p></main>",
              css: "",
              summary: `Built by ${id} over 3 sources.`,
              sourcesUsed: ["a", "b", "c"],
            },
            usage: usage(),
            finishReason: "stop",
          };
        },
      };
    };
    const engine = makeEngineWithFactory(db, factory);

    await engine.start({ runId: "run_split", material, workerId: "sonnet" });

    // Research ALWAYS runs on the fixed research worker; the picked model only
    // builds. The two phases use genuinely different agents (rrt.6).
    expect(researchBy).toContain("anthropic-research");
    expect(researchBy).not.toContain("sonnet");
    expect(buildBy).toContain("sonnet");
    expect(buildBy).not.toContain("anthropic-research");
  });

  it("should run end-to-end on the factory-built agent (no single injected agent)", async () => {
    // Use the MockAgent (scripted drift→pass) so the run actually clears the
    // voice gate; the point of this test is that the engine runs entirely off a
    // factory-built agent with NO single injected `agent` dep.
    const built: string[] = [];
    const engine = makeEngineWithFactory(db, (w) => {
      built.push(w ?? "?");
      return new MockAgent();
    });
    const outcome = await engine.start({
      runId: "run_e2e",
      material,
      workerId: "sonnet",
    });
    expect(built).toContain("sonnet");
    // Cleared every gate → pauses at the final human approval gate.
    expect(outcome.status).toBe("awaiting_approval");
  });
});
