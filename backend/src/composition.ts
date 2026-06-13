import type { Persona, Validator } from "@publisher/shared";
import type { DB } from "./stores/db.js";
import {
  createPersonaStore,
  type PersonaStore,
} from "./stores/persona.store.js";
import { createRunStore } from "./stores/run.store.js";
import { createResearchStore } from "./stores/research.store.js";
import { createShareStore, type ShareStore } from "./stores/share.store.js";
import {
  createShareService,
  type ShareService,
} from "./services/share.service.js";
import { createSlug } from "./util/slug.js";
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
import type { Judge } from "./checkpoints/judge.js";
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
  /**
   * Legacy single-agent injection (tests / pinned-worker path). Supply this OR
   * `agentFactory`. When both are present the per-run factory wins downstream.
   */
  agent?: Agent;
  /**
   * PER-RUN worker selection (rrt.2.1). Builds the agent for each run's own
   * `workerId`. server.ts passes this so the R11 swap is real, not cosmetic.
   */
  agentFactory?: (workerId: string) => Agent;
  sink: Sink;
  /** Reuse one PersonaStore so personas authored via /personas are visible. */
  personaStore?: PersonaStore;
  defaultWorkerId?: string;
  /** Optional telemetry sink threaded into the run engine (Pillar 4 system layer). */
  telemetry?: Telemetry;
  /**
   * Real LLM voice judge (rrt.4.1). When supplied it replaces the deterministic
   * voice judge in the voice-fidelity gate; omitted → the deterministic default
   * (mock/test). server.ts builds this via `selectVoiceJudge` so it is only the
   * real Claude judge when USE_REAL_AGENT + a key are present. Fail-closed
   * behavior is unchanged: a faulting judge still fails the gate.
   */
  voiceJudge?: Judge;
  /**
   * Public origin for share links (`${shareBaseUrl}/p/${slug}`). Defaults to ""
   * → a relative `/p/${slug}`, matching the existing `/published/:id`
   * convention. server.ts passes `PUBLIC_BASE_URL` (share.2.4).
   */
  shareBaseUrl?: string;
}

export interface RunComposition {
  deps: RunServiceDeps;
  personaStore: PersonaStore;
  /** The share data-access store (share.2.4) — server.ts mounts routes off it. */
  shareStore: ShareStore;
  /** The share business-logic service (mint + resolveBySlug), wired to the same
   * run store + sink the run engine uses, and to PUBLIC_BASE_URL. */
  shareService: ShareService;
}

export function composeRunDeps(input: RunCompositionInput): RunComposition {
  const { db, sink } = input;
  if (!input.agent && !input.agentFactory) {
    throw new Error(
      "composeRunDeps requires either `agent` or `agentFactory` (rrt.2.1).",
    );
  }
  const personaStore = input.personaStore ?? createPersonaStore(db);
  const guardrailEngine = createGuardrailEngine();
  // One run store shared by the run engine AND the share service so the share
  // service's published/ownership checks see exactly the runs the engine wrote.
  const runStore = createRunStore(db);

  const deps: RunServiceDeps = {
    // Per-run worker selection (rrt.2.1) when a factory is supplied; otherwise
    // the legacy single injected agent. Engine asserts one is present.
    ...(input.agentFactory ? { agentFactory: input.agentFactory } : {}),
    ...(input.agent ? { agent: input.agent } : {}),
    sink,
    source: createSource(personaStore),
    guardrailEngine,
    // The engine passes the per-run validators provider; we thread Track B's
    // compiled detective validators into the design-conformance gate (dp0.5.1).
    buildCheckpoints: (validators: (persona: Persona) => Validator[]) =>
      createCheckpoints({
        validators,
        ...(input.voiceJudge ? { voiceJudge: input.voiceJudge } : {}),
      }),
    personaStore,
    runStore,
    researchStore: createResearchStore(db),
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

  // Share graph (share.2.4): the slug-keyed store + the business-logic service.
  // The service reuses the same run store as the engine and mints links against
  // PUBLIC_BASE_URL (relative "/p/:slug" when unset).
  const shareStore = createShareStore(db);
  const shareService = createShareService({
    shareStore,
    runStore,
    slug: createSlug,
    baseUrl: input.shareBaseUrl ?? "",
  });

  return { deps, personaStore, shareStore, shareService };
}
