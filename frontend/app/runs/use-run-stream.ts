/**
 * `useRunStream` — the connection manager behind the four-lane run view. It owns
 * the lifecycle: connecting → live → (reconnecting) → closed, folding every
 * RunEvent through the pure reducer (run-state) so components render derived
 * state only.
 *
 * Source-injectable (RunStreamSource factory) so tests + dev drive it with the
 * mock stream and production drives it with a real EventSource — no fork in the
 * hook itself. Reconnect re-opens with the last seq we folded (D5).
 */
"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { RunEvent } from "@publisher/shared";
import { applyEvent, emptyRunView, isTerminal, type RunView } from "./run-state.js";
import { eventSourceStream, type RunStreamSource } from "./sse.js";
import { streamUrl } from "./run-api.js";

/** The connection's user-visible lifecycle state. */
export type ConnectionState =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error"
  | "closed";

export interface UseRunStreamOptions {
  /** The run to stream. When undefined the hook stays idle (no run started). */
  runId?: string;
  /**
   * Factory that builds a stream source for a given (runId, sinceSeq). Defaults
   * to a real EventSource; tests/dev inject a mock-backed source.
   */
  sourceFactory?: (runId: string, sinceSeq: number) => RunStreamSource;
  /** Override the API base (mostly for tests). */
  base?: string;
}

export interface UseRunStreamResult {
  view: RunView;
  connection: ConnectionState;
  /** Force a reconnect from the last folded seq (e.g. a "Reconnect" button). */
  reconnect: () => void;
}

type ViewAction =
  | { kind: "event"; event: RunEvent }
  | { kind: "reset"; runId?: string };

function viewReducer(view: RunView, action: ViewAction): RunView {
  switch (action.kind) {
    case "event":
      return applyEvent(view, action.event);
    case "reset":
      return emptyRunView(action.runId);
  }
}

export function useRunStream(
  options: UseRunStreamOptions,
): UseRunStreamResult {
  const { runId, sourceFactory, base } = options;
  const [view, dispatch] = useReducer(viewReducer, undefined, () =>
    emptyRunView(runId),
  );
  const [connection, setConnection] = useState<ConnectionState>(
    runId ? "connecting" : "idle",
  );

  // The latest seq we have folded — read inside callbacks without re-subscribing.
  const lastSeqRef = useRef<number>(-1);
  lastSeqRef.current = view.lastSeq;

  // Bump this to force a reconnect (effect dependency).
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const reconnect = useCallback(() => {
    setReconnectNonce((n) => n + 1);
  }, []);

  // Reset the view when the run changes.
  useEffect(() => {
    dispatch({ kind: "reset", runId });
    lastSeqRef.current = -1;
  }, [runId]);

  useEffect(() => {
    if (!runId) {
      setConnection("idle");
      return;
    }

    // A reconnect (nonce > 0 OR a prior lastSeq) shows the reconnecting state;
    // a fresh connect shows connecting.
    setConnection(lastSeqRef.current >= 0 ? "reconnecting" : "connecting");

    const factory =
      sourceFactory ??
      ((id: string, sinceSeq: number) =>
        eventSourceStream(streamUrl(id, sinceSeq >= 0 ? sinceSeq : undefined, base)));

    const source = factory(runId, lastSeqRef.current);
    let terminal = false;

    source.onOpen(() => {
      if (!terminal) setConnection("live");
    });
    source.onEvent((e) => {
      dispatch({ kind: "event", event: e });
      lastSeqRef.current = Math.max(lastSeqRef.current, e.seq);
      if (e.t === "published" || e.t === "failed") {
        terminal = true;
        setConnection("closed");
        source.close();
      }
    });
    source.onError(() => {
      if (terminal) return;
      setConnection("error");
    });

    return () => {
      source.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, reconnectNonce, sourceFactory, base]);

  // When the folded view reaches terminal, reflect closed (covers mock sources
  // that complete without an explicit transport close).
  useEffect(() => {
    if (isTerminal(view.status)) setConnection("closed");
  }, [view.status]);

  return { view, connection, reconnect };
}
