/**
 * LiveRunPanel — binds the run stream (useRunStream) to the RunView surface and
 * wires the escalation decision back to POST /runs/:id/decision. A thin client
 * shell so the page components stay declarative. Source-injectable so the demo
 * page drives it with the mock stream and the real run page drives it with SSE.
 */
"use client";

import { useCallback } from "react";
import type { Persona, EscalationOption } from "@publisher/shared";
import { useRunStream } from "@/app/runs/use-run-stream";
import type { RunStreamSource } from "@/app/runs/sse";
import { postDecision } from "@/app/runs/run-api";
import { RunView } from "./RunView";

export interface LiveRunPanelProps {
  runId: string;
  persona?: Persona | undefined;
  workerId?: string | undefined;
  /** Inject a stream source (demo/mock); defaults to a real EventSource. */
  sourceFactory?:
    | ((runId: string, sinceSeq: number) => RunStreamSource)
    | undefined;
  /** Inject the decision sender (tests/demo); defaults to the real API. */
  sendDecision?:
    | ((
        runId: string,
        decision: { choice: EscalationOption; payload?: { persona?: Persona } },
      ) => Promise<void>)
    | undefined;
  base?: string | undefined;
}

export function LiveRunPanel({
  runId,
  persona,
  workerId,
  sourceFactory,
  sendDecision = postDecision,
  base,
}: LiveRunPanelProps): React.ReactElement {
  const { view, connection, reconnect } = useRunStream({
    runId,
    sourceFactory,
    base,
  });

  const onDecide = useCallback(
    async (decision: {
      choice: EscalationOption;
      payload?: { persona?: Persona };
    }): Promise<void> => {
      await sendDecision(runId, decision);
    },
    [runId, sendDecision],
  );

  return (
    <RunView
      view={view}
      connection={connection}
      persona={persona}
      workerId={workerId}
      onReconnect={reconnect}
      onDecide={onDecide}
      base={base}
    />
  );
}
