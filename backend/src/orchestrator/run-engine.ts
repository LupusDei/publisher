import { randomUUID } from "node:crypto";
import type {
  AgentResult,
  Alarm,
  Budget,
  CheckpointContext,
  CheckpointResult,
  Escalation,
  EscalationDecision,
  Material,
  Persona,
  Phase,
  ResearchResult,
  RunEvent,
  Validator,
  Webpage,
} from "@publisher/shared";
import type {
  Agent,
  AlarmEmitter,
  Checkpoint as CheckpointType,
  GuardrailEngine,
  Journal,
  Meter,
  Sink,
} from "../domain/index.js";
import type { RunStore } from "../stores/run.store.js";
import type { ResearchStore } from "../stores/research.store.js";
import type { PersonaStore } from "../stores/persona.store.js";
import type { WebpageStore } from "../stores/webpage.store.js";
import type { CheckpointStore } from "../stores/checkpoint.store.js";
import type { AlarmStore } from "../stores/alarm.store.js";
import type { MetricStore } from "../stores/metric.store.js";
import type { EscalationStore } from "../stores/escalation.store.js";
import type { RunEventBus } from "./event-bus.js";
import { createMeter } from "../observability/meter.js";
import { detectBreaches } from "../observability/budget.js";
import { createAlarmEmitter } from "../observability/alarm-emitter.js";
import { persistAlarms } from "../observability/persist.js";
import { nextBuildFeedback } from "../checkpoints/next-build-feedback.js";
import { RESEARCH_MIN_SOURCES } from "../checkpoints/research-sufficiency.js";
import { errorToAlarm } from "../agent/alarm-mapping.js";
import { RESEARCH_WORKER_ID } from "../agent/workers.js";
import {
  createNoopTelemetry,
  type Telemetry,
  type Span,
} from "../telemetry/metrics.js";

/**
 * The RunEngine — the SPINE (Track G, R2/R10). A THIN sequencer (Constitution
 * Rule 4): it owns ordering, the bounded retry loop, journaling, and HITL
 * pause/resume — but NO domain logic. Feedback composition lives in Track D
 * (`nextBuildFeedback`); judging lives in the checkpoints; alarm shaping lives
 * in Track E; prompt compilation lives in Track B. The engine only decides
 * WHAT to call NEXT and writes every transition to the authoritative journal.
 *
 * Per ASSUMPTIONS: the journal (`run_events`) is the source of truth (D5); a
 * per-run `Meter` records every agent call (D9); alarms are RETURNED then
 * forwarded, never thrown (D7); liveness is RunEvents, not token streams (D10);
 * escalation recompiles guardrails on enrich (D19).
 */

/** Default cap on build attempts before a refusal escalates (R2 loop bound). */
export const MAX_ATTEMPTS = 2;

/**
 * Cap on research attempts before alerting the user a topic is research-light.
 * 2 = the initial pass + exactly ONE re-research. Never loops forever.
 */
export const MAX_RESEARCH_ATTEMPTS = 2;

/** The canonical post-build gate order (research gate runs before build). */
const BUILD_GATES = [
  "voice-fidelity",
  "design-conformance",
  "quality",
] as const;

export interface RunEngineDeps {
  /**
   * Legacy single-agent injection. Used when no `agentFactory` is supplied (the
   * orchestrator/unit-test path that pins one agent). When BOTH are given, the
   * per-run factory wins so each run resolves its own `workerId`.
   */
  agent?: Agent;
  /**
   * PER-RUN worker selection (rrt.2.1). Builds the agent for a run's `workerId`
   * in `start()` so the R11 swap is real, not cosmetic. The composition root
   * threads this in; the engine stays provider-blind (it only sees `Agent`).
   */
  agentFactory?: (workerId: string) => Agent;
  sink: Sink;
  guardrailEngine: GuardrailEngine;
  /** Builds the ordered checkpoint list for a run, given a validators provider. */
  buildCheckpoints: (
    validators: (persona: Persona) => Validator[],
  ) => CheckpointType[];
  journal: Journal;
  eventBus: RunEventBus;
  runStore: RunStore;
  /** Persona lookup — used to rehydrate a paused run after a process restart. */
  personaStore: PersonaStore;
  /** Durable research (publisher-kgv) — persisted on success so a resume after a
   * restart picks up at build instead of re-running the expensive research. */
  researchStore: ResearchStore;
  webpageStore: WebpageStore;
  checkpointStore: CheckpointStore;
  alarmStore: AlarmStore;
  metricStore: MetricStore;
  escalationStore: EscalationStore;
  /** Declared token/latency budget — the deterministic breach path (D12). */
  budget?: Budget;
  /** Override the build-attempt cap (tests use this to force escalation). */
  maxAttempts?: number;
  /** Override the research-attempt cap (default 2 = initial + one re-research). */
  maxResearchAttempts?: number;
  newId?: () => string;
  now?: () => string;
  /** Injected metrics/tracing facade; defaults to a no-op (zero behavior change). */
  telemetry?: Telemetry;
}

export interface StartInput {
  runId: string;
  material: Material;
  workerId: string;
  /** Owning user (85q.4), threaded onto the run header so list/get can scope. */
  userId?: string;
}

/** Terminal outcomes the caller (run service) reports back to the API layer. */
export type RunOutcome =
  | { status: "published" }
  | { status: "failed"; reason: string }
  | { status: "escalated"; escalation: Escalation }
  // Passed every gate; paused at the final human approval gate (HITL). The
  // user approves → publish, requests changes → enrich/retry, or discards.
  | { status: "awaiting_approval"; escalation: Escalation };

/** The mutable per-run context the loop carries and `resume` rehydrates. */
interface RunContext {
  runId: string;
  workerId: string;
  /**
   * The BUILD agent — the model the user picked to compile the final page
   * (rrt.2.1/rrt.6). Resolved once from the per-run factory (or the legacy
   * single injected agent) and reused across the build/refine loop and resume.
   * The run is labelled with this worker.
   */
  agent: Agent;
  /**
   * The RESEARCH agent (rrt.6) — ALWAYS the web-research worker, independent of
   * the picked build model, so every run researches with real sources while the
   * user only chooses who builds. In mock/legacy single-agent setups this is the
   * same agent as `agent`.
   */
  researchAgent: Agent;
  persona: Persona;
  material: Material;
  system: string;
  validators: Validator[];
  research: ResearchResult;
  attempt: number;
  lastWebpage?: Webpage;
  priorResults: CheckpointResult[];
  passedGates: Set<string>;
  meter: Meter;
  alarmEmitter: AlarmEmitter;
  seq: number;
  /** Telemetry run span (Pillar 4); ends at every terminal transition. */
  runSpan: Span;
  /** Wall-clock start (ms epoch) for run-duration telemetry. */
  startedAt: number;
}

// Distribute Omit across the union so each variant keeps its own field set.
type EventBody = RunEvent extends infer V
  ? V extends RunEvent
    ? Omit<V, "runId" | "seq" | "ts">
    : never
  : never;

export interface RunEngine {
  start(input: StartInput): Promise<RunOutcome>;
  resume(runId: string, decision: EscalationDecision): Promise<RunOutcome>;
  /**
   * Resume a run that was CUT OFF mid-flight (publisher-kgv) — e.g. a backend
   * restart abandoned it at `interrupted`/researching/building/checking. Rebuilds
   * the context from durable state and continues from the furthest checkpoint
   * reached: persisted research → skip straight to build; a partially-checked
   * draft → re-run only the gates not yet passed. Distinct from `resume`, which
   * applies a HUMAN decision to a paused run.
   */
  resumeRun(runId: string): Promise<RunOutcome>;
}

export function createRunEngine(deps: RunEngineDeps): RunEngine {
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => randomUUID());
  const maxAttempts = deps.maxAttempts ?? MAX_ATTEMPTS;
  const maxResearchAttempts = deps.maxResearchAttempts ?? MAX_RESEARCH_ATTEMPTS;
  const telemetry = deps.telemetry ?? createNoopTelemetry();

  /**
   * Resolve the agent for a run's worker (rrt.2.1). Prefer the per-run factory
   * (so the run's `workerId` actually selects the model); fall back to the
   * legacy single injected agent. One of the two MUST be configured.
   */
  function agentForWorker(workerId: string): Agent {
    if (deps.agentFactory) return deps.agentFactory(workerId);
    if (deps.agent) return deps.agent;
    throw new Error(
      "RunEngine requires either `agentFactory` or `agent` in its deps.",
    );
  }

  /** Paused contexts awaiting a human decision (single-process demo, D11). */
  const pending = new Map<string, RunContext>();

  // ── journal + stream emit (every transition; D5/D10) ─────────────────────
  function emit(ctx: RunContext, body: EventBody): RunEvent {
    const event = {
      runId: ctx.runId,
      seq: ctx.seq++,
      ts: now(),
      ...body,
    } as RunEvent;
    deps.journal.append(event);
    deps.eventBus.publish(event);
    return event;
  }

  /** Forward a batch of returned alarms to journal + stream + store (D7). */
  function forwardAlarms(
    ctx: RunContext,
    phase: Phase | undefined,
    alarms: readonly Alarm[],
  ): void {
    if (alarms.length === 0) return;
    persistAlarms(deps.alarmStore, ctx.runId, phase, alarms);
    for (const alarm of alarms) {
      emit(ctx, { t: "alarm", pillar: "observability", alarm });
    }
  }

  /** Snapshot the meter → journal + store after each agent call (D9). */
  function recordMetrics(ctx: RunContext): void {
    const snapshot = ctx.meter.snapshot();
    deps.metricStore.insert(ctx.runId, snapshot);
    emit(ctx, { t: "metric", pillar: "observability", metrics: snapshot });
    // Deterministic budget breach → structured alarm (D12).
    if (deps.budget) {
      const breaches = detectBreaches(deps.budget, snapshot);
      for (const breach of breaches) {
        forwardAlarms(ctx, breach.phase, ctx.alarmEmitter.evaluate(breach));
      }
    }
  }

  /**
   * Run one agent call under the meter, mapping a thrown fault to an alarm
   * (D7: exceptions are true faults → PROVIDER_ERROR/RATE_LIMITED). On fault we
   * record a usage-less call (→ errorRate) and rethrow a tagged error so the
   * loop can fail the run cleanly.
   */
  async function metered<T>(
    ctx: RunContext,
    phase: Phase,
    call: () => Promise<AgentResult<T>>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await call();
      const latencyMs = Date.now() - startedAt;
      ctx.meter.record(phase, {
        usage: result.usage,
        latencyMs,
      });
      // Mirror per-phase latency + token usage into Pillar-4 telemetry.
      telemetry.recordPhaseDuration(phase, latencyMs);
      telemetry.recordTokens(
        phase,
        ctx.workerId,
        result.usage.totalTokens,
        result.usage.cachedInputTokens,
      );
      return result.value;
    } catch (err) {
      ctx.meter.record(phase, { latencyMs: Date.now() - startedAt });
      const alarm = errorToAlarm(err, { phase, workerId: ctx.workerId });
      telemetry.recordError(alarm.type, ctx.workerId);
      ctx.runSpan.recordException(err);
      forwardAlarms(ctx, phase, [alarm]);
      throw new AgentFault(
        err instanceof Error ? err.message : String(err),
        alarm,
      );
    }
  }

  // ── checkpoint helpers ───────────────────────────────────────────────────
  function checkpointContext(
    ctx: RunContext,
    webpage?: Webpage,
  ): CheckpointContext {
    return {
      persona: ctx.persona,
      material: ctx.material,
      research: ctx.research,
      ...(webpage ? { webpage } : {}),
      attempt: ctx.attempt,
      priorResults: ctx.priorResults,
    };
  }

  function recordCheckpoint(ctx: RunContext, result: CheckpointResult): void {
    deps.checkpointStore.insert(ctx.runId, ctx.attempt, result);
    emit(ctx, { t: "checkpoint", pillar: "checkpoints", result });
    if (!result.passed) telemetry.recordCheckpointFailure(result.name);
    if (result.score !== undefined)
      telemetry.recordCheckpointScore(result.name, result.score);
    forwardAlarms(ctx, undefined, result.alarms);
    ctx.priorResults.push(result);
    if (result.passed) ctx.passedGates.add(result.name);
  }

  function gate(ctx: RunContext, name: string): CheckpointType {
    const found = deps
      .buildCheckpoints(() => ctx.validators)
      .find((c) => c.name === name);
    if (!found) throw new Error(`Checkpoint ${name} not found`);
    return found;
  }

  /** Pull the alarm off a failed checkpoint (it always carries exactly one). */
  function hardAlarm(result: CheckpointResult): Alarm {
    return (
      result.alarms[0] ?? {
        type: "CHECKPOINT_ERROR",
        severity: "critical",
        context: { checkpoint: result.name },
        recommendedAction: "Escalate for human review.",
      }
    );
  }

  // ── terminal transitions ─────────────────────────────────────────────────
  async function publish(
    ctx: RunContext,
    webpage: Webpage,
  ): Promise<RunOutcome> {
    deps.webpageStore.insert(ctx.runId, ctx.attempt, webpage, true);
    const receipt = await deps.sink.publish(webpage, {
      runId: ctx.runId,
      workerId: ctx.workerId,
    });
    emit(ctx, { t: "published", pillar: "material", receipt });
    deps.runStore.updateStatus(ctx.runId, "published");
    pending.delete(ctx.runId);
    telemetry.recordOutcome("published");
    telemetry.recordRunDuration(Date.now() - ctx.startedAt);
    ctx.runSpan.end();
    telemetry.runEnded();
    return { status: "published" };
  }

  function failRun(ctx: RunContext, reason: string): RunOutcome {
    emit(ctx, { t: "failed", reason });
    deps.runStore.updateStatus(ctx.runId, "failed");
    pending.delete(ctx.runId);
    telemetry.recordOutcome("failed");
    telemetry.recordRunDuration(Date.now() - ctx.startedAt);
    ctx.runSpan.end();
    telemetry.runEnded();
    return { status: "failed", reason };
  }

  function escalate(ctx: RunContext, reason: string, alarm: Alarm): RunOutcome {
    const escalation: Escalation = {
      id: newId(),
      runId: ctx.runId,
      reason,
      alarm,
      options: ["enrich_persona", "approve_anyway", "retry", "abort"],
    };
    deps.escalationStore.insert(escalation);
    emit(ctx, { t: "escalation", escalation });
    deps.runStore.updateStatus(ctx.runId, "escalated");
    pending.set(ctx.runId, ctx);
    telemetry.recordOutcome("escalated");
    telemetry.recordRunDuration(Date.now() - ctx.startedAt);
    ctx.runSpan.end();
    telemetry.runEnded();
    return { status: "escalated", escalation };
  }

  /**
   * FINAL APPROVAL GATE (HITL). A draft that cleared every gate is NOT auto-
   * published — it pauses awaiting the user's sign-off. We reuse the same
   * pause/resume machinery as escalation (the harness "stops and asks"), with a
   * benign info-severity AWAITING_APPROVAL signal so the existing approve/reject
   * UI works. On resume: approve_anyway → publish; enrich_persona → recompile +
   * rebuild (request changes); abort → discard.
   */
  function awaitApproval(ctx: RunContext, webpage: Webpage): RunOutcome {
    ctx.lastWebpage = webpage;
    const escalation: Escalation = {
      id: newId(),
      runId: ctx.runId,
      reason:
        "Draft is ready and cleared every gate — approve to publish, request changes, or discard.",
      alarm: {
        type: "AWAITING_APPROVAL",
        severity: "info",
        context: { attempt: ctx.attempt },
        recommendedAction:
          "Review the draft and approve to publish (final human-in-the-loop gate).",
      },
      options: ["approve_anyway", "enrich_persona", "abort"],
    };
    deps.escalationStore.insert(escalation);
    emit(ctx, { t: "escalation", escalation });
    deps.runStore.updateStatus(ctx.runId, "awaiting_approval");
    pending.set(ctx.runId, ctx);
    telemetry.recordOutcome("awaiting_approval");
    telemetry.recordRunDuration(Date.now() - ctx.startedAt);
    ctx.runSpan.end();
    // NOTE: the run is still HELD active awaiting the human gate, so we do NOT
    // call telemetry.runEnded() here — runsActive stays incremented until a
    // later terminal transition (publish/failRun/escalate) in resume().
    return { status: "awaiting_approval", escalation };
  }

  // ── the build → gate → refine loop (R2) ──────────────────────────────────
  async function buildAndCheck(
    ctx: RunContext,
    feedback: string | undefined,
  ): Promise<RunOutcome> {
    const phase: Phase = feedback ? "refine" : "build";
    deps.runStore.updateStatus(
      ctx.runId,
      ctx.attempt === 1 ? "building" : "refining",
    );
    emit(ctx, { t: "phase", phase });

    let webpage: Webpage;
    try {
      webpage = await metered(ctx, phase, () =>
        ctx.agent.build({
          system: ctx.system,
          research: ctx.research,
          ...(feedback ? { feedback } : {}),
        }),
      );
    } catch (err) {
      return failRun(
        ctx,
        err instanceof AgentFault ? err.message : String(err),
      );
    }
    recordMetrics(ctx);
    ctx.lastWebpage = webpage;
    deps.webpageStore.insert(ctx.runId, ctx.attempt, webpage, false);

    // CHECK — voice → design → quality, in order. A fresh build runs every gate.
    return checkAndDecide(ctx, webpage, BUILD_GATES);
  }

  /**
   * Evaluate `gatesToRun` against a (just-built OR persisted) webpage, then
   * decide the run's next move. Split out of `buildAndCheck` so a RESUMED run
   * can re-check only the gates it had not reached yet (publisher-kgv) — gates
   * already passed in this attempt are NOT re-run, so the run continues from
   * exactly where it was cut off rather than rebuilding from scratch.
   */
  async function checkAndDecide(
    ctx: RunContext,
    webpage: Webpage,
    gatesToRun: readonly string[],
  ): Promise<RunOutcome> {
    deps.runStore.updateStatus(ctx.runId, "checking");
    ctx.lastWebpage = webpage;
    const failures: CheckpointResult[] = [];
    for (const name of gatesToRun) {
      const result = await gate(ctx, name).evaluate(
        checkpointContext(ctx, webpage),
      );
      recordCheckpoint(ctx, result);
      const score = result.score;
      // The draft event (R2 money shot) — emitted per gate so the UI sees the
      // score that decided the verdict, keyed to this attempt.
      emit(ctx, {
        t: "draft",
        attempt: ctx.attempt,
        webpage,
        ...(score !== undefined ? { score } : {}),
        passed: result.passed,
      });
      if (!result.passed) failures.push(result);
    }

    if (failures.length === 0) {
      // Cleared every gate → pause at the final human approval gate, do NOT
      // auto-publish. Publishing happens on the user's approval in resume().
      telemetry.recordRunAttempts("refine", ctx.attempt);
      return awaitApproval(ctx, webpage);
    }

    // A hard (non-auto-correctable) failure escalates immediately (R10).
    const hard = failures.find((f) => !f.autoCorrectable);
    if (hard) {
      telemetry.recordRunAttempts("refine", ctx.attempt);
      return escalate(ctx, `Hard gate failed: ${hard.name}`, hardAlarm(hard));
    }

    // Auto-correctable: refine if we have attempts left, else escalate.
    if (ctx.attempt >= maxAttempts) {
      telemetry.recordRunAttempts("refine", ctx.attempt);
      return escalate(
        ctx,
        `Exhausted ${maxAttempts} attempts; gates still failing: ${failures
          .map((f) => f.name)
          .join(", ")}`,
        hardAlarm(failures[0]!),
      );
    }

    // Compose feedback in Track D (NOT inline) and refine.
    const next = nextBuildFeedback(failures);
    ctx.attempt += 1;
    ctx.priorResults = [];
    return buildAndCheck(ctx, next);
  }

  // ── research → build, as one re-enterable pipeline ───────────────────────
  /**
   * RESEARCH (with at most ONE re-research on insufficiency, then escalate
   * research-light) → BUILD. Extracted from `start` so a rehydrated enrich/retry
   * — which has lost its in-memory research text after a restart — can re-run
   * the whole pipeline rather than building on empty research. Bounded by
   * maxResearchAttempts (default 2).
   */
  async function runFromResearch(ctx: RunContext): Promise<RunOutcome> {
    let researchAttempt = 1;
    let researchGuidance: string | undefined;
    for (;;) {
      deps.runStore.updateStatus(ctx.runId, "researching");
      emit(ctx, { t: "phase", phase: "research" });
      try {
        ctx.research = await metered(ctx, "research", () =>
          ctx.researchAgent.research({
            system: ctx.system,
            concept: researchGuidance
              ? `${ctx.material.concept}\n\n[Research guidance — go broader/deeper]: ${researchGuidance}`
              : ctx.material.concept,
          }),
        );
      } catch (err) {
        return failRun(
          ctx,
          err instanceof AgentFault ? err.message : String(err),
        );
      }
      recordMetrics(ctx);

      // GATE 1 — research sufficiency (deterministic, before any build).
      const researchResult = await gate(ctx, "research-sufficiency").evaluate(
        checkpointContext(ctx),
      );
      recordCheckpoint(ctx, researchResult);
      if (researchResult.passed) {
        // Persist the accepted research so a restart mid-build can resume here
        // instead of re-running the expensive web_search pass (publisher-kgv).
        deps.researchStore.save(ctx.runId, researchAttempt, ctx.research);
        telemetry.recordRunAttempts("research", researchAttempt);
        break;
      }

      // Insufficient. Re-research ONCE; once the retry is spent, alert the user
      // the topic is research-light instead of looping forever.
      if (researchAttempt >= maxResearchAttempts) {
        telemetry.recordRunAttempts("research", researchAttempt);
        const found = researchResult.score ?? 0;
        const need = researchResult.threshold ?? RESEARCH_MIN_SOURCES;
        return escalate(
          ctx,
          `Topic appears research-light: only ${found} credible source(s) after a re-research pass (need >= ${need}). Enrich the concept or persona, or approve anyway.`,
          hardAlarm(researchResult),
        );
      }
      researchAttempt += 1;
      researchGuidance = researchResult.feedback;
      // Keep build-phase priorResults clean (research verdicts are journaled).
      ctx.priorResults = [];
    }
    ctx.priorResults = [];

    return buildAndCheck(ctx, undefined);
  }

  /**
   * Rebuild a paused run's context from the persisted stores when the in-memory
   * `pending` entry is gone — e.g. after a process restart — so a human decision
   * can still resume it (durability for the HITL gate). Returns null when the
   * run is not in a decidable (paused) state. Research text is NOT persisted, so
   * a rehydrated context starts with empty research: terminal decisions (abort /
   * approve_anyway) need none; enrich / retry re-run from research.
   */
  function rehydrate(runId: string): RunContext | null {
    const run = deps.runStore.get(runId);
    if (
      !run ||
      (run.status !== "escalated" && run.status !== "awaiting_approval")
    ) {
      return null;
    }
    const persona = deps.personaStore.getById(run.personaId);
    if (!persona) return null;

    const compiled = deps.guardrailEngine.compile(persona);
    const drafts = deps.webpageStore.listByRun(runId);
    const lastDraft = drafts.length ? drafts[drafts.length - 1] : undefined;
    // Continue the event sequence after the persisted journal so resumed events
    // don't collide with the monotonic seq the event store enforces.
    const seq = deps.journal.load(runId).length;

    telemetry.runStarted();
    const ctx: RunContext = {
      runId,
      workerId: run.workerId,
      // Rebuild the per-run agents from the persisted worker (rrt.2/rrt.6) so a
      // rehydrated run's retry/enrich uses the right build model and still
      // researches via the fixed research worker.
      agent: agentForWorker(run.workerId),
      researchAgent: agentForWorker(RESEARCH_WORKER_ID),
      persona,
      material: { concept: run.concept, persona },
      system: compiled.systemPrompt,
      validators: compiled.validators,
      research: { text: "", sources: [] },
      attempt: 1,
      ...(lastDraft ? { lastWebpage: lastDraft.webpage } : {}),
      priorResults: [],
      passedGates: new Set(),
      meter: createMeter(),
      alarmEmitter: deps.budget
        ? createAlarmEmitter(deps.budget)
        : createAlarmEmitter(),
      seq,
      runSpan: telemetry.startRunSpan(runId),
      startedAt: Date.parse(run.createdAt) || Date.now(),
    };
    pending.set(runId, ctx);
    return ctx;
  }

  /**
   * Reconstruct the build progress of a run from its persisted checkpoints: the
   * latest build attempt, which of that attempt's gates already PASSED, and the
   * failures so far (for refine feedback). Lets a resume continue checking only
   * the gates it had not yet reached, rather than rebuilding from scratch.
   */
  function buildGateState(runId: string): {
    attempt: number;
    passed: Set<string>;
    failures: CheckpointResult[];
  } {
    const buildGates = BUILD_GATES as readonly string[];
    const buildCps = deps.checkpointStore
      .listByRun(runId)
      .filter((c) => buildGates.includes(c.result.name));
    if (buildCps.length === 0) {
      return { attempt: 1, passed: new Set(), failures: [] };
    }
    const attempt = Math.max(...buildCps.map((c) => c.attempt));
    const atAttempt = buildCps.filter((c) => c.attempt === attempt);
    const passed = new Set(
      atAttempt.filter((c) => c.result.passed).map((c) => c.result.name),
    );
    const failures = atAttempt
      .filter((c) => !c.result.passed)
      .map((c) => c.result);
    return { attempt, passed, failures };
  }

  /** States a cut-off run can be resumed FROM. Paused (HITL) runs resume via a
   * decision; terminal runs are done. */
  function resumableReason(run: { status: string } | null): string | null {
    if (!run) return "unknown run";
    if (run.status === "escalated" || run.status === "awaiting_approval")
      return "run is paused for a human decision (use the decision flow)";
    if (run.status === "published" || run.status === "failed")
      return `run already ${run.status}`;
    return null; // created | interrupted | researching | building | checking | refining
  }

  return {
    async start({ runId, material, workerId, userId }) {
      deps.runStore.create({
        id: runId,
        personaId: material.persona.id,
        concept: material.concept,
        workerId,
        ...(userId ? { userId } : {}),
      });

      telemetry.runStarted();
      const runSpan = telemetry.startRunSpan(runId);

      const compiled = deps.guardrailEngine.compile(material.persona);
      const ctx: RunContext = {
        runId,
        workerId,
        // Build the agent for THIS run's worker once, up front (rrt.2.1). The
        // research agent is the fixed web-research worker (rrt.6) — the picked
        // model only builds; research always gathers real sources.
        agent: agentForWorker(workerId),
        researchAgent: agentForWorker(RESEARCH_WORKER_ID),
        persona: material.persona,
        material,
        system: compiled.systemPrompt,
        validators: compiled.validators,
        research: { text: "", sources: [] },
        attempt: 1,
        priorResults: [],
        passedGates: new Set(),
        meter: createMeter(),
        alarmEmitter: deps.budget
          ? createAlarmEmitter(deps.budget)
          : createAlarmEmitter(),
        seq: 0,
        runSpan,
        startedAt: Date.now(),
      };

      return runFromResearch(ctx);
    },

    async resume(runId, decision) {
      // Durability (HITL): if the in-memory context is gone — e.g. the process
      // restarted since the run paused — rebuild it from the stores so the
      // human decision still applies, instead of dead-ending on RunNotPaused.
      let ctx = pending.get(runId);
      let rehydrated = false;
      if (!ctx) {
        const rebuilt = rehydrate(runId);
        if (!rebuilt) throw new RunNotPausedError(runId);
        ctx = rebuilt;
        rehydrated = true;
      }

      deps.escalationStore.resolve(decision.escalationId, decision);
      emit(ctx, { t: "resumed", decision });

      if (decision.choice === "approve_anyway") {
        // Publish the last draft as-is (human override).
        if (!ctx.lastWebpage) {
          return failRun(ctx, "approve_anyway with no draft to publish.");
        }
        return publish(ctx, ctx.lastWebpage);
      }

      if (decision.choice === "enrich_persona") {
        // Reload + RECOMPILE the (edited) persona before continuing (D19).
        const enriched = decision.payload?.persona ?? ctx.persona;
        ctx.persona = enriched;
        ctx.material = { ...ctx.material, persona: enriched };
        const recompiled = deps.guardrailEngine.compile(enriched);
        ctx.system = recompiled.systemPrompt;
        ctx.validators = recompiled.validators;
        // Re-enter from a fresh build attempt under the enriched guardrails. A
        // rehydrated context lost its research text (not persisted) → re-run the
        // full pipeline from research; a warm context already has it.
        ctx.attempt = 1;
        ctx.priorResults = [];
        ctx.passedGates.clear();
        return rehydrated
          ? runFromResearch(ctx)
          : buildAndCheck(ctx, undefined);
      }

      if (decision.choice === "abort") {
        return failRun(ctx, "Run aborted by human decision.");
      }

      // retry (D19): re-enter. Rehydrated → from research; warm → from build.
      ctx.attempt = 1;
      ctx.priorResults = [];
      ctx.passedGates.clear();
      return rehydrated ? runFromResearch(ctx) : buildAndCheck(ctx, undefined);
    },

    async resumeRun(runId) {
      const run = deps.runStore.get(runId);
      const blocked = resumableReason(run);
      if (!run || blocked) {
        throw new RunNotResumableError(runId, blocked ?? "unknown run");
      }
      const persona = deps.personaStore.getById(run.personaId);
      if (!persona) {
        throw new RunNotResumableError(runId, "persona no longer exists");
      }

      const compiled = deps.guardrailEngine.compile(persona);
      const stored = deps.researchStore.latest(runId);
      const { attempt, passed, failures } = buildGateState(runId);
      const drafts = deps.webpageStore.listByRun(runId);
      const draftForAttempt = [...drafts]
        .reverse()
        .find((d) => d.attempt === attempt);
      // Continue the journal's monotonic seq after the persisted events.
      const seq = deps.journal.load(runId).length;

      telemetry.runStarted();
      const ctx: RunContext = {
        runId,
        workerId: run.workerId,
        agent: agentForWorker(run.workerId),
        researchAgent: agentForWorker(RESEARCH_WORKER_ID),
        persona,
        material: { concept: run.concept, persona },
        system: compiled.systemPrompt,
        validators: compiled.validators,
        research: stored ? stored.research : { text: "", sources: [] },
        attempt,
        ...(draftForAttempt ? { lastWebpage: draftForAttempt.webpage } : {}),
        priorResults: failures,
        passedGates: passed,
        meter: createMeter(),
        alarmEmitter: deps.budget
          ? createAlarmEmitter(deps.budget)
          : createAlarmEmitter(),
        seq,
        runSpan: telemetry.startRunSpan(runId),
        startedAt: Date.parse(run.createdAt) || Date.now(),
      };

      // No durable research → it never cleared the research gate; re-run the
      // (unpersisted) research pipeline from the top.
      if (!stored) return runFromResearch(ctx);

      // Research is durable. If a draft for this attempt exists and only SOME of
      // its gates ran, continue checking the remainder on that draft — pick up
      // exactly where it was cut off (publisher-kgv).
      const remaining = BUILD_GATES.filter((g) => !passed.has(g));
      if (
        draftForAttempt &&
        remaining.length > 0 &&
        remaining.length < BUILD_GATES.length
      ) {
        return checkAndDecide(ctx, draftForAttempt.webpage, remaining);
      }

      // Research done but this attempt's build didn't finish (or no partial
      // draft to continue) → (re)build this attempt. Refine carries feedback.
      const feedback =
        attempt > 1 && failures.length > 0
          ? nextBuildFeedback(failures)
          : undefined;
      return buildAndCheck(ctx, feedback);
    },
  };
}

/** Raised when `resumeRun` is called for a run that cannot be resumed (unknown,
 * terminal, or paused for a human decision). */
export class RunNotResumableError extends Error {
  constructor(
    readonly runId: string,
    readonly detail: string,
  ) {
    super(`Run ${runId} cannot be resumed: ${detail}`);
    this.name = "RunNotResumableError";
  }
}

/** A thrown true-fault carrying the alarm the loop already forwarded. */
export class AgentFault extends Error {
  constructor(
    message: string,
    readonly alarm: Alarm,
  ) {
    super(message);
    this.name = "AgentFault";
  }
}

/** Raised when `resume` is called for a run that is not paused/escalated. */
export class RunNotPausedError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} is not paused awaiting a decision`);
    this.name = "RunNotPausedError";
  }
}
