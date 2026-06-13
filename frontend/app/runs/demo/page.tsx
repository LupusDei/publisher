"use client";

/**
 * /runs/demo — the proof surface running on the deterministic MOCK stream, with
 * NO backend required. The hero of the 5-minute demo when the live backend
 * isn't wired: pick a narrative (happy redraft / escalation / refusal) and watch
 * it stream into the four lanes in real time. Swapping to the real SSE endpoint
 * is a one-line change (drop the mock sourceFactory).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import type { RunEvent, EscalationOption, Persona } from "@publisher/shared";
import type { RunStreamSource } from "@/app/runs/sse";
import {
  mockRunEvents,
  mockEscalationEvents,
  mockFailureEvents,
  playMockStream,
} from "@/app/runs/mock-stream";
import { LiveRunPanel } from "@/components/LiveRunPanel";
import "@/components/runs-ui.css";

type Narrative = "happy" | "escalation" | "failure";

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

function eventsFor(n: Narrative): RunEvent[] {
  if (n === "escalation") return mockEscalationEvents("run_demo");
  if (n === "failure") return mockFailureEvents("run_demo");
  return mockRunEvents("run_demo");
}

/**
 * A mock stream source backed by `playMockStream`. Honours the reconnect cursor:
 * on reconnect (sinceSeq >= 0) it replays only events with a higher seq, exactly
 * as the real journal tail would (D5).
 */
function makeMockSource(events: RunEvent[]): (
  runId: string,
  sinceSeq: number,
) => RunStreamSource {
  return (_runId, sinceSeq) => {
    let onEvent = (_e: RunEvent): void => {};
    let onOpen = (): void => {};
    let cancel = (): void => {};
    const remaining = events.filter((e) => e.seq > sinceSeq);
    // Defer so handlers register before the first tick.
    queueMicrotask(() => {
      onOpen();
      cancel = playMockStream(remaining, (e) => onEvent(e), { intervalMs: 700 });
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

export default function DemoPage(): React.ReactElement {
  const [narrative, setNarrative] = useState<Narrative>("happy");
  // `runKey` forces a fresh LiveRunPanel (new stream) when the narrative changes.
  const [runKey, setRunKey] = useState(0);

  const events = useMemo(() => eventsFor(narrative), [narrative]);
  const sourceFactory = useMemo(() => makeMockSource(events), [events]);

  const sendDecision = async (
    _runId: string,
    _decision: { choice: EscalationOption; payload?: { persona?: Persona } },
  ): Promise<void> => {
    // In demo mode, resolving the escalation simply replays the happy path.
    setNarrative("happy");
    setRunKey((k) => k + 1);
  };

  return (
    <div className="runs-shell">
      <p className="eyebrow">Publisher · Harness · Demo</p>
      <h1>Run stream — mock</h1>
      <nav className="runs-nav" aria-label="Runs navigation">
        <Link href="/runs">Start a real run</Link>
        <Link href="/runs/gallery">Gallery</Link>
      </nav>

      <div className="demo-controls" role="group" aria-label="Choose a demo narrative">
        {(["happy", "escalation", "failure"] as const).map((n) => (
          <button
            key={n}
            type="button"
            className={`btn ${narrative === n ? "btn-enrich" : ""}`}
            aria-pressed={narrative === n}
            onClick={() => {
              setNarrative(n);
              setRunKey((k) => k + 1);
            }}
          >
            {n === "happy"
              ? "Redraft → publish (R2)"
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
