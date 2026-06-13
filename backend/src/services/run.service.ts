import { randomUUID } from "node:crypto";
import type {
  Alarm,
  EscalationDecision,
  Persona,
  Run,
  RunEvent,
  Validator,
} from "@publisher/shared";
import type {
  Agent,
  Checkpoint,
  GuardrailEngine,
  Sink,
  Source,
} from "../domain/index.js";
import type { PersonaStore } from "../stores/persona.store.js";
import type { RunStore } from "../stores/run.store.js";
import type { RunEventStore } from "../stores/run-event.store.js";
import type { WebpageStore } from "../stores/webpage.store.js";
import type { CheckpointStore } from "../stores/checkpoint.store.js";
import type { AlarmStore } from "../stores/alarm.store.js";
import type { MetricStore } from "../stores/metric.store.js";
import type { EscalationStore } from "../stores/escalation.store.js";
import { createJournal } from "../journal/index.js";
import {
  createRunEngine,
  RunNotPausedError,
  type RunEngine,
  type RunOutcome,
} from "../orchestrator/index.js";
import type { RunEventBus } from "../orchestrator/event-bus.js";

/** Raised when input fails to load (empty concept / unknown persona) — 400. */
export class InputRejectedError extends Error {
  constructor(public readonly alarms: Alarm[]) {
    super(alarms[0]?.recommendedAction ?? "Run input rejected");
    this.name = "InputRejectedError";
  }
}

/** Re-export so the route can map a not-paused resume to a 409. */
export { RunNotPausedError };

export interface RunServiceDeps {
  agent: Agent;
  sink: Sink;
  source: Source;
  guardrailEngine: GuardrailEngine;
  /** Build the ordered checkpoints; the engine injects the validators provider. */
  buildCheckpoints: (
    validators: (persona: Persona) => Validator[],
  ) => Checkpoint[];
  personaStore: PersonaStore;
  runStore: RunStore;
  eventStore: RunEventStore;
  webpageStore: WebpageStore;
  checkpointStore: CheckpointStore;
  alarmStore: AlarmStore;
  metricStore: MetricStore;
  escalationStore: EscalationStore;
  eventBus: RunEventBus;
  /** Default worker id for runs that don't pick one. */
  defaultWorkerId?: string;
  newRunId?: () => string;
}

export interface RunService {
  /**
   * Start a run. Loads + validates input (Source, INPUT_EMPTY → reject), then
   * drives the engine to a terminal outcome. Returns the runId and the outcome.
   */
  start(input: {
    personaId: string;
    concept: string;
    workerId?: string;
  }): Promise<{ runId: string; outcome: RunOutcome }>;
  /** The ordered journal for a run; `sinceSeq` returns only seq > sinceSeq. */
  events(runId: string, sinceSeq?: number): RunEvent[];
  /** The run header row (status/summary), or null if unknown. */
  get(runId: string): Run | null;
  /** Apply a human escalation decision and resume the run. */
  decide(
    runId: string,
    decision: EscalationDecision,
  ): Promise<{ outcome: RunOutcome }>;
  /** The live event bus — the SSE route subscribes here to tail a run. */
  bus: RunEventBus;
}

/**
 * Run service — the layer between the runs route and the RunEngine/stores
 * (Constitution Rule 4). It owns input loading (Source) and run-id minting; the
 * RunEngine owns the loop + journal. The journal is built over the event store
 * and shared with the engine so `events()`/SSE read exactly what the engine
 * wrote (D5: the log is the single source of truth).
 */
export function createRunService(deps: RunServiceDeps): RunService {
  const newRunId = deps.newRunId ?? (() => `run_${randomUUID()}`);
  const defaultWorkerId = deps.defaultWorkerId ?? "mock";
  const journal = createJournal(deps.eventStore);

  const engine: RunEngine = createRunEngine({
    agent: deps.agent,
    sink: deps.sink,
    guardrailEngine: deps.guardrailEngine,
    buildCheckpoints: deps.buildCheckpoints,
    journal,
    eventBus: deps.eventBus,
    runStore: deps.runStore,
    webpageStore: deps.webpageStore,
    checkpointStore: deps.checkpointStore,
    alarmStore: deps.alarmStore,
    metricStore: deps.metricStore,
    escalationStore: deps.escalationStore,
  });

  return {
    bus: deps.eventBus,

    async start({ personaId, concept, workerId }) {
      // INPUT loading via Material Source — INPUT_EMPTY is returned, not thrown
      // (D7); reject the request before any agent call.
      const { material, alarms } = await deps.source.load(concept, personaId);
      if (!material) {
        throw new InputRejectedError(alarms);
      }
      const runId = newRunId();
      const outcome = await engine.start({
        runId,
        material,
        workerId: workerId ?? defaultWorkerId,
      });
      return { runId, outcome };
    },

    events(runId, sinceSeq) {
      return sinceSeq === undefined
        ? journal.load(runId)
        : journal.loadSince(runId, sinceSeq);
    },

    get(runId) {
      return deps.runStore.get(runId);
    },

    async decide(runId, decision) {
      const outcome = await engine.resume(runId, decision);
      return { outcome };
    },
  };
}
