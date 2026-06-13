import type { Persona, Validator } from "@publisher/shared";
import type { DB } from "./stores/db.js";
import {
  createPersonaStore,
  type PersonaStore,
} from "./stores/persona.store.js";
import { createRunStore } from "./stores/run.store.js";
import { createRunEventStore } from "./stores/run-event.store.js";
import { createWebpageStore } from "./stores/webpage.store.js";
import { createCheckpointStore } from "./stores/checkpoint.store.js";
import { createAlarmStore } from "./stores/alarm.store.js";
import { createMetricStore } from "./stores/metric.store.js";
import { createEscalationStore } from "./stores/escalation.store.js";
import type { Agent, Sink } from "./domain/index.js";
import { createSource } from "./material/source.js";
import { createGuardrailEngine } from "./guardrails/index.js";
import { createCheckpoints } from "./checkpoints/index.js";
import { createEventBus } from "./orchestrator/event-bus.js";
import type { RunServiceDeps } from "./services/run.service.js";
import type { Telemetry } from "./telemetry/metrics.js";

/**
 * Composition root for a run (Track G keystone). Wires ALL the real pillars into
 * one `RunServiceDeps` graph: a single shared `PersonaStore`, the Material
 * Source/Sink, the Guardrail engine, the ordered Checkpoints (the engine injects
 * Track B's compiled validators as the design-conformance provider — "declared
 * once, enforced twice"), and every projection store. server.ts and the R2
 * integration test both build the graph here so they stay identical.
 */
export interface RunCompositionInput {
  db: DB;
  agent: Agent;
  sink: Sink;
  /** Reuse one PersonaStore so personas authored via /personas are visible. */
  personaStore?: PersonaStore;
  defaultWorkerId?: string;
  /** Optional telemetry sink threaded into the run engine (Pillar 4 system layer). */
  telemetry?: Telemetry;
}

export interface RunComposition {
  deps: RunServiceDeps;
  personaStore: PersonaStore;
}

export function composeRunDeps(input: RunCompositionInput): RunComposition {
  const { db, agent, sink } = input;
  const personaStore = input.personaStore ?? createPersonaStore(db);
  const guardrailEngine = createGuardrailEngine();

  const deps: RunServiceDeps = {
    agent,
    sink,
    source: createSource(personaStore),
    guardrailEngine,
    // The engine passes the per-run validators provider; we thread Track B's
    // compiled detective validators into the design-conformance gate (dp0.5.1).
    buildCheckpoints: (validators: (persona: Persona) => Validator[]) =>
      createCheckpoints({ validators }),
    personaStore,
    runStore: createRunStore(db),
    eventStore: createRunEventStore(db),
    webpageStore: createWebpageStore(db),
    checkpointStore: createCheckpointStore(db),
    alarmStore: createAlarmStore(db),
    metricStore: createMetricStore(db),
    escalationStore: createEscalationStore(db),
    eventBus: createEventBus(),
    ...(input.defaultWorkerId
      ? { defaultWorkerId: input.defaultWorkerId }
      : {}),
    ...(input.telemetry ? { telemetry: input.telemetry } : {}),
  };

  return { deps, personaStore };
}
