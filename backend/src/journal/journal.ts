import type {
  CheckpointName,
  ResearchResult,
  RunEvent,
  Webpage,
} from "@publisher/shared";
import type { Journal } from "../domain/index.js";
import type { RunEventStore } from "../stores/run-event.store.js";

/**
 * The domain `Journal` over the authoritative `RunEventStore` (ASSUMPTIONS D5):
 * `run_events` is the single source of truth, the journal is the typed view of
 * it, and REPLAY is a pure FOLD of the log — no separate replay table.
 *
 * `append`/`load`/`loadSince` delegate to the store (which enforces monotonic
 * seq). `replayFrom(runId)` folds the events into the re-entry point + the prior
 * outputs the orchestrator reuses so it never redoes passed work (R9): replay
 * re-enters at the FIRST non-passed checkpoint, reusing prior research + the
 * last draft.
 */

/** Canonical gate order — the fold walks this to find the re-entry point. */
const ORDER: CheckpointName[] = [
  "research-sufficiency",
  "voice-fidelity",
  "design-conformance",
  "quality",
];

interface Fold {
  /** Latest pass/fail verdict per checkpoint (latest event wins). */
  verdicts: Map<CheckpointName, boolean>;
  /** The most recent draft webpage seen, if any. */
  lastWebpage?: Webpage;
}

function foldEvents(events: RunEvent[]): Fold {
  const fold: Fold = { verdicts: new Map() };
  for (const e of events) {
    if (e.t === "draft") {
      fold.lastWebpage = e.webpage;
    } else if (e.t === "checkpoint") {
      // Latest verdict for a gate overrides any earlier one (re-runs across attempts).
      fold.verdicts.set(e.result.name, e.result.passed);
    }
  }
  return fold;
}

/** First gate (canonical order) whose latest verdict is not `true`. */
function firstUnpassed(verdicts: Map<CheckpointName, boolean>): CheckpointName {
  for (const name of ORDER) {
    if (verdicts.get(name) !== true) return name;
  }
  // All passed → collapse re-entry to the final gate (nothing to redo before it).
  return ORDER[ORDER.length - 1]!;
}

/** Gates (in order) whose latest verdict is `true`. */
function passedCheckpoints(
  verdicts: Map<CheckpointName, boolean>,
): CheckpointName[] {
  return ORDER.filter((name) => verdicts.get(name) === true);
}

export function createJournal(store: RunEventStore): Journal {
  return {
    append(e: RunEvent): void {
      store.append(e);
    },

    load(runId: string): RunEvent[] {
      return store.load(runId);
    },

    loadSince(runId: string, seq: number): RunEvent[] {
      return store.loadSince(runId, seq);
    },

    replayFrom(runId: string) {
      const fold = foldEvents(store.load(runId));
      const passed = passedCheckpoints(fold.verdicts);
      const fromCheckpoint = firstUnpassed(fold.verdicts);

      // Research is reusable ONLY if its gate passed — replay-from-build reuses
      // research without re-researching (the defense promise), but a failed
      // research gate forces a re-research. Reconstructed from the last draft's
      // sourcesUsed since the event log carries no standalone research payload.
      let research: ResearchResult | undefined;
      if (fold.verdicts.get("research-sufficiency") === true) {
        const sources = fold.lastWebpage?.sourcesUsed ?? [];
        research = { text: "", sources };
      }

      // Build priorOutputs with conditional keys — `exactOptionalPropertyTypes`
      // forbids assigning an explicit `undefined` to an optional `research?`.
      return {
        fromCheckpoint,
        priorOutputs: {
          ...(research ? { research } : {}),
          ...(fold.lastWebpage ? { lastWebpage: fold.lastWebpage } : {}),
          passedCheckpoints: passed,
        },
      };
    },
  };
}
