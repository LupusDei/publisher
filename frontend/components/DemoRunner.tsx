"use client";

/**
 * DemoRunner — the proof surface running on the deterministic MOCK stream, with
 * NO backend required. Extracted from the demo page so it can take props (a Next
 * page default-export may not) and be unit-tested with a fast stream interval.
 *
 * Pick a narrative (happy redraft / escalation / refusal) and watch it stream
 * into the four lanes live. Swapping to the real SSE endpoint is a one-line
 * change: drop the mock `sourceFactory` from LiveRunPanel.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import type { RunEvent, EscalationOption, Persona } from "@publisher/shared";
import type { RunStreamSource } from "@/app/runs/sse";
import {
  mockRunEvents,
  mockEscalationEvents,
  mockApprovalEvents,
  mockFailureEvents,
  playMockStream,
} from "@/app/runs/mock-stream";
import { LiveRunPanel } from "./LiveRunPanel";
import "./runs-ui.css";

type Narrative = "happy" | "approval" | "escalation" | "failure";

const DEMO_PERSONA: Persona = {
  id: "p_essayist",
  name: "The Essayist",
  voice: "Measured, lyrical, exact. Long sentences that resolve.",
  voiceSample:
    "The whole becomes greater than its parts not by addition but by relation.",
  stylePoints: ["no colloquialisms", "concrete imagery"],
  keyLearnings: [],
  designElements: { typography: "serif headings", palette: "ink on cream" },
};

function eventsFor(
  n: Narrative,
  approvalOutcome?: "publish" | "discard",
): RunEvent[] {
  if (n === "escalation") return mockEscalationEvents("run_demo");
  if (n === "approval") return mockApprovalEvents("run_demo", approvalOutcome);
  if (n === "failure") return mockFailureEvents("run_demo");
  return mockRunEvents("run_demo");
}

/**
 * A mock stream source backed by `playMockStream`. Honours the reconnect cursor:
 * on reconnect (sinceSeq >= 0) it replays only events with a higher seq, exactly
 * as the real journal tail would (D5).
 */
function makeMockSource(
  events: RunEvent[],
  intervalMs: number,
): (runId: string, sinceSeq: number) => RunStreamSource {
  return (_runId, sinceSeq) => {
    let onEvent = (_e: RunEvent): void => {};
    let onOpen = (): void => {};
    let cancel = (): void => {};
    const remaining = events.filter((e) => e.seq > sinceSeq);
    // Defer so handlers register before the first tick.
    queueMicrotask(() => {
      onOpen();
      cancel = playMockStream(remaining, (e) => onEvent(e), { intervalMs });
    });
    return {
      onEvent: (h) => {
        onEvent = h;
      },
      onOpen: (h) => {
        onOpen = h;
      },
      onError: () => {},
      close: () => cancel(),
    };
  };
}

export interface DemoRunnerProps {
  /** Stream tick interval; small values let tests run the narrative fast. */
  streamIntervalMs?: number;
}

export function DemoRunner({
  streamIntervalMs = 700,
}: DemoRunnerProps): React.ReactElement {
  const [narrative, setNarrative] = useState<Narrative>("happy");
  // `runKey` forces a fresh LiveRunPanel (new stream) when the narrative changes.
  const [runKey, setRunKey] = useState(0);
  // How the FINAL approval gate was resolved (drives the publish/discard tail).
  const [approvalOutcome, setApprovalOutcome] = useState<
    "publish" | "discard" | undefined
  >(undefined);

  const events = useMemo(
    () => eventsFor(narrative, approvalOutcome),
    [narrative, approvalOutcome],
  );
  const sourceFactory = useMemo(
    () => makeMockSource(events, streamIntervalMs),
    [events, streamIntervalMs],
  );

  function pickNarrative(n: Narrative): void {
    setNarrative(n);
    setApprovalOutcome(undefined);
    setRunKey((k) => k + 1);
  }

  const sendDecision = async (
    _runId: string,
    decision: { choice: EscalationOption; payload?: { persona?: Persona } },
  ): Promise<void> => {
    if (narrative === "approval") {
      // The FINAL human-in-the-loop gate: approve publishes, discard fails, and
      // "request changes" (enrich) re-runs the build back to the approval gate.
      if (decision.choice === "approve_anyway") setApprovalOutcome("publish");
      else if (decision.choice === "abort") setApprovalOutcome("discard");
      else setApprovalOutcome(undefined);
      setRunKey((k) => k + 1);
      return;
    }
    // Any other escalation in demo mode simply replays the happy path.
    pickNarrative("happy");
  };

  return (
    <div className="runs-shell">
      <p className="eyebrow">Publisher · Harness · Demo</p>
      <h1>Run stream — mock</h1>
      <nav className="runs-nav" aria-label="Runs navigation">
        <Link href="/runs">Start a real run</Link>
        <Link href="/runs/gallery">Gallery</Link>
      </nav>

      <div
        className="demo-controls"
        role="group"
        aria-label="Choose a demo narrative"
      >
        {(["happy", "approval", "escalation", "failure"] as const).map((n) => (
          <button
            key={n}
            type="button"
            className={`btn ${narrative === n ? "btn-enrich" : ""}`}
            aria-pressed={narrative === n}
            onClick={() => pickNarrative(n)}
          >
            {n === "happy"
              ? "Redraft → publish (R2)"
              : n === "approval"
                ? "Draft → approve & publish (R12)"
                : n === "escalation"
                  ? "Escalation (R10)"
                  : "Refused to publish"}
          </button>
        ))}
      </div>

      <LiveRunPanel
        key={`${narrative}-${runKey}`}
        runId="run_demo"
        persona={DEMO_PERSONA}
        workerId="opus"
        sourceFactory={sourceFactory}
        sendDecision={sendDecision}
      />
    </div>
  );
}
