/**
 * The run view-model reducer. The backend's `run_events` log is the authoritative
 * truth (ASSUMPTIONS D5); this module folds an ordered `RunEvent[]` into the
 * derived state every hero component renders from. Pure + deterministic so it is
 * trivially testable and replay-safe: feeding the same events (live or via
 * catch-up) always yields the same view-model.
 *
 * The fold is the single place run semantics live, so the components stay dumb.
 */
import type {
  RunEvent,
  RunStatus,
  Pillar,
  CheckpointResult,
  Alarm,
  Metrics,
  Escalation,
  EscalationDecision,
  Receipt,
  Webpage,
  Phase,
} from "@publisher/shared";

/** A single build attempt, reconstructed from its `draft` event (R2). */
export interface DraftAttempt {
  attempt: number;
  webpage: Webpage;
  score?: number | undefined;
  passed?: boolean | undefined;
  /** The feedback that PRODUCED the NEXT attempt (drives the diff narrative). */
  feedbackToNext?: string | undefined;
  ts: string;
}

/** One event projected onto a pillar lane (R1 four-lane view). */
export interface LaneEntry {
  seq: number;
  ts: string;
  event: RunEvent;
}

/** The four labelled pillar lanes, in canonical left-to-right order. */
export const PILLARS: readonly Pillar[] = [
  "material",
  "guardrails",
  "checkpoints",
  "observability",
] as const;

export const PILLAR_LABELS: Record<Pillar, string> = {
  material: "Material",
  guardrails: "Guardrails",
  checkpoints: "Checkpoints",
  observability: "Observability",
};

/** The fully-derived view-model the components render. */
export interface RunView {
  runId?: string | undefined;
  status: RunStatus;
  /** The current/last phase the worker is in (header chip). */
  phase?: Phase | undefined;
  /** Highest seq folded so far — the reconnect cursor (D5). */
  lastSeq: number;
  /** Events bucketed by pillar lane, in arrival order. */
  lanes: Record<Pillar, LaneEntry[]>;
  /** Events with no pillar tag (phase/published/failed/resumed) — the spine. */
  spine: LaneEntry[];
  /** Every build attempt retained, oldest-first (the draft timeline, R2). */
  drafts: DraftAttempt[];
  /** Every checkpoint result, in order. */
  checkpoints: CheckpointResult[];
  /** Every alarm raised, in order (R5 cards). */
  alarms: Alarm[];
  /** The latest metrics snapshot (live token/latency meter). */
  metrics?: Metrics | undefined;
  /** A pending escalation awaiting a human decision (R10). */
  escalation?: Escalation | undefined;
  /** The decision that resumed a run, if any. */
  lastDecision?: EscalationDecision | undefined;
  /** The publish receipt on success. */
  receipt?: Receipt | undefined;
  /** The failure reason on a terminal failure ("refused to publish"). */
  failureReason?: string | undefined;
}

/** The empty starting view before any event has arrived. */
export function emptyRunView(runId?: string | undefined): RunView {
  return {
    runId,
    status: "created",
    lastSeq: -1,
    lanes: { material: [], guardrails: [], checkpoints: [], observability: [] },
    spine: [],
    drafts: [],
    checkpoints: [],
    alarms: [],
  };
}

/** Map a phase to the run status it implies (header chip continuity). */
function statusForPhase(phase: Phase): RunStatus {
  switch (phase) {
    case "research":
      return "researching";
    case "build":
      return "building";
    case "refine":
      return "refining";
  }
}

/**
 * Fold a single event into the view. Out-of-order or already-seen events (seq
 * <= lastSeq) are ignored so a reconnect that re-sends overlapping events is
 * idempotent (D5). Returns a NEW view object (immutable update) so React state
 * transitions are detectable.
 */
export function applyEvent(view: RunView, event: RunEvent): RunView {
  // Idempotency / ordering guard: never fold an event we have already folded.
  if (event.seq <= view.lastSeq) return view;

  const next: RunView = {
    ...view,
    runId: view.runId ?? event.runId,
    lastSeq: event.seq,
    lanes: { ...view.lanes },
    spine: view.spine,
    drafts: view.drafts,
    checkpoints: view.checkpoints,
    alarms: view.alarms,
  };

  const entry: LaneEntry = { seq: event.seq, ts: event.ts, event };

  // Bucket onto a pillar lane when tagged; otherwise it is a spine event.
  if (event.pillar) {
    next.lanes[event.pillar] = [...view.lanes[event.pillar], entry];
  } else {
    next.spine = [...view.spine, entry];
  }

  switch (event.t) {
    case "phase": {
      next.phase = event.phase;
      next.status = statusForPhase(event.phase);
      break;
    }
    case "draft": {
      next.status = "building";
      next.drafts = [
        ...view.drafts,
        {
          attempt: event.attempt,
          webpage: event.webpage,
          score: event.score,
          passed: event.passed,
          ts: event.ts,
        },
      ];
      break;
    }
    case "checkpoint": {
      next.status = "checking";
      next.checkpoints = [...view.checkpoints, event.result];
      // A failed checkpoint carries the feedback that drives the NEXT draft —
      // attach it to the most-recent draft so the timeline can show the cause
      // of the redraft (the R2 narrative).
      if (event.result.feedback && next.drafts.length > 0) {
        const drafts = [...next.drafts];
        const last = drafts[drafts.length - 1];
        if (last && last.feedbackToNext === undefined) {
          drafts[drafts.length - 1] = {
            ...last,
            feedbackToNext: event.result.feedback,
          };
          next.drafts = drafts;
        }
      }
      break;
    }
    case "alarm": {
      next.alarms = [...view.alarms, event.alarm];
      break;
    }
    case "metric": {
      next.metrics = event.metrics;
      break;
    }
    case "escalation": {
      // AWAITING_APPROVAL is not a fault — the run passed every gate and is
      // paused at the FINAL human approval gate. Reflect that with the calm
      // `awaiting_approval` status rather than the alarming `escalated` one,
      // so the header chip reads "draft ready" instead of "escalated".
      next.status =
        event.escalation.alarm.type === "AWAITING_APPROVAL"
          ? "awaiting_approval"
          : "escalated";
      next.escalation = event.escalation;
      break;
    }
    case "resumed": {
      next.lastDecision = event.decision;
      next.escalation = undefined; // cleared — the run is moving again
      break;
    }
    case "published": {
      next.status = "published";
      next.receipt = event.receipt;
      break;
    }
    case "failed": {
      next.status = "failed";
      next.failureReason = event.reason;
      break;
    }
  }

  return next;
}

/** Fold an ordered batch of events (catch-up / replay). */
export function applyEvents(view: RunView, events: RunEvent[]): RunView {
  return events.reduce(applyEvent, view);
}

/**
 * Total tokens across all phases in a metrics snapshot — the headline number on
 * the live meter. Returns 0 when no metrics have arrived yet.
 */
export function totalTokens(metrics?: Metrics): number {
  if (!metrics) return 0;
  const p = metrics.perPhase;
  return p.research.tokens + p.build.tokens + p.refine.tokens;
}

/** Total latency (ms) across all phases — the second headline meter number. */
export function totalLatencyMs(metrics?: Metrics): number {
  if (!metrics) return 0;
  const p = metrics.perPhase;
  return p.research.latencyMs + p.build.latencyMs + p.refine.latencyMs;
}

/** Whether the run has reached a terminal state (published or failed). */
export function isTerminal(status: RunStatus): boolean {
  return status === "published" || status === "failed";
}
