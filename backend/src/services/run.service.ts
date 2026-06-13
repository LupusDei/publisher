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
import type { Telemetry } from "../telemetry/metrics.js";
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
  /**
   * Legacy single-agent injection. Optional now that runs can pick their own
   * worker via `agentFactory` (rrt.2.1). Supply one or the other; when both are
   * present the per-run factory wins in the engine.
   */
  agent?: Agent;
  /**
   * PER-RUN worker selection (rrt.2.1). The composition root threads this in so
   * each run builds the agent for ITS OWN `workerId`. Passed straight to the
   * RunEngine, which resolves it in `start()`.
   */
  agentFactory?: (workerId: string) => Agent;
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
  /** Optional telemetry sink (Pillar 4 system layer). No-op default in the engine. */
  telemetry?: Telemetry;
}

export interface RunService {
  /**
   * Start a run, FIRE-AND-FORGET (dp0.11 / D10). Loads + validates input
   * synchronously (Source, INPUT_EMPTY → reject BEFORE returning), mints the
   * runId, then kicks the engine WITHOUT awaiting and returns `{ runId }`
   * immediately so the UI can open the SSE stream and watch the four pillar
   * lanes fill live. The engine keeps streaming every RunEvent to the journal +
   * bus as it runs; terminal/paused outcomes surface via the stream (and via
   * `waitFor` for deterministic consumers).
   */
  start(input: {
    personaId: string;
    concept: string;
    workerId?: string;
    /** Owning user (85q.4) — stamped onto the run row so list/get can scope. */
    userId?: string;
  }): Promise<{ runId: string }>;
  /**
   * Await a run's current outcome without racing the journal — resolves from
   * the captured engine promise (the latest of `start`/`resume`). Lets tests and
   * consumers wait for terminal/paused deterministically. Rejects if `runId` is
   * unknown.
   */
  waitFor(runId: string): Promise<RunOutcome>;
  /** The ordered journal for a run; `sinceSeq` returns only seq > sinceSeq. */
  events(runId: string, sinceSeq?: number): RunEvent[];
  /** The run header row (status/summary), or null if unknown. */
  get(runId: string): Run | null;
  /** All runs (newest first); with `ownerId`, only that owner's (R9). */
  list(ownerId?: string): Run[];
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

  // The current in-flight (or settled) engine promise per run. `start` seeds it
  // fire-and-forget; `resume` replaces it with the post-decision continuation.
  // `waitFor` resolves from here so consumers never race the journal. Every
  // stored promise has its rejection already absorbed (→ `failed`), so it can be
  // awaited any number of times without risking an unhandled rejection (D10).
  const outcomes = new Map<string, Promise<RunOutcome>>();

  /**
   * Wrap an engine promise so a thrown true-fault (one the engine could not
   * journal itself) never escapes as an unhandled rejection: log it and resolve
   * to a terminal `failed` so `waitFor` (and the run status) stay coherent.
   *
   * A `RunNotPausedError` is NOT a run fault — it's a caller error (resume on a
   * not-paused run). We re-throw it so `decide`/the route can map it to a 409,
   * and we keep the run's prior captured outcome intact (don't mark it failed).
   */
  function guard(runId: string, p: Promise<RunOutcome>): Promise<RunOutcome> {
    const prior = outcomes.get(runId);
    const guarded = p.catch((err: unknown): RunOutcome => {
      if (err instanceof RunNotPausedError) {
        // Preserve whatever outcome the run already settled to; surface for 409.
        if (prior) outcomes.set(runId, prior);
        throw err;
      }
      const reason = err instanceof Error ? err.message : String(err);
      // The engine journals its own handled faults; this is the last-resort net.
      console.error(`[run ${runId}] engine failed:`, reason);
      try {
        deps.runStore.updateStatus(runId, "failed");
      } catch {
        // Status update is best-effort here; the log above is the record.
      }
      return { status: "failed", reason };
    });
    // The guarded promise may reject (RunNotPausedError) — attach a no-op catch
    // so simply CAPTURING it never trips an unhandled-rejection warning; the
    // real awaiter (`decide`) still observes the throw.
    void guarded.catch(() => undefined);
    outcomes.set(runId, guarded);
    return guarded;
  }

  const engine: RunEngine = createRunEngine({
    // Prefer the per-run factory (rrt.2.1); fall back to a single injected agent
    // for the legacy/test path. The engine asserts at least one is present.
    ...(deps.agentFactory ? { agentFactory: deps.agentFactory } : {}),
    ...(deps.agent ? { agent: deps.agent } : {}),
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
    ...(deps.telemetry ? { telemetry: deps.telemetry } : {}),
  });

  return {
    bus: deps.eventBus,

    async start({ personaId, concept, workerId, userId }) {
      // INPUT loading via Material Source — INPUT_EMPTY is returned, not thrown
      // (D7); reject the request before any agent call AND before minting an id.
      const { material, alarms } = await deps.source.load(concept, personaId);
      if (!material) {
        throw new InputRejectedError(alarms);
      }
      const runId = newRunId();
      // FIRE-AND-FORGET: kick the engine WITHOUT awaiting so the route can hand
      // back the runId immediately. The engine streams every RunEvent to the
      // journal + bus as it runs (D5/D10); `guard` captures the promise and
      // neutralizes any unhandled rejection.
      guard(
        runId,
        engine.start({
          runId,
          material,
          workerId: workerId ?? defaultWorkerId,
          ...(userId ? { userId } : {}),
        }),
      );
      return { runId };
    },

    waitFor(runId) {
      const p = outcomes.get(runId);
      if (!p) {
        return Promise.reject(new Error(`Unknown run ${runId}`));
      }
      return p;
    },

    events(runId, sinceSeq) {
      return sinceSeq === undefined
        ? journal.load(runId)
        : journal.loadSince(runId, sinceSeq);
    },

    get(runId) {
      return deps.runStore.get(runId);
    },

    list(ownerId) {
      return deps.runStore.list(ownerId);
    },

    async decide(runId, decision) {
      // Resume the paused run. Capture the continuation as the run's current
      // outcome promise so a later `waitFor` sees the post-decision terminal,
      // but AWAIT the raw resume here so a RunNotPausedError still propagates to
      // the route (→ 409) instead of being absorbed into a `failed` outcome.
      const resumed = engine.resume(runId, decision);
      guard(runId, resumed);
      const outcome = await resumed;
      return { outcome };
    },
  };
}
