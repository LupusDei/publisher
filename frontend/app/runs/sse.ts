/**
 * A small SSE client for the run stream. Wraps the browser `EventSource` behind
 * a typed, injectable interface so the hook can be driven by the mock stream in
 * tests/dev and by a real `EventSource` in production with no code-path fork.
 *
 * Reconnect strategy (ASSUMPTIONS D5): the server sets each SSE `id:` to the
 * event `seq`. On drop we reconnect with `?sinceSeq=<lastSeq>` so the journal
 * tail re-folds only the events we missed — a live run survives a network blip.
 */
import type { RunEvent } from "@publisher/shared";

/** What the hook needs from a stream source — satisfied by EventSource + mock. */
export interface RunStreamSource {
  /** Called for every parsed RunEvent. */
  onEvent(handler: (e: RunEvent) => void): void;
  /** Called when the underlying transport opens (connected). */
  onOpen(handler: () => void): void;
  /** Called on a transport error (the hook decides to reconnect). */
  onError(handler: () => void): void;
  /** Tear down the source. */
  close(): void;
}

/**
 * Every `t` the run journal emits. The backend tags each SSE message with
 * `event: <t>` (runs.ts `streamRun`), so a native browser `EventSource`
 * dispatches them to `addEventListener("<t>", …)` — they do NOT fire the default
 * `onmessage`. This list must cover the RunEvent union or those events are
 * silently dropped (the connection opens but no events ever fold).
 */
export const RUN_EVENT_TYPES = [
  "phase",
  "draft",
  "checkpoint",
  "alarm",
  "metric",
  "escalation",
  "resumed",
  "published",
  "failed",
] as const;

/** Parse a raw SSE `data:` payload into a RunEvent, or null if malformed. */
export function parseRunEvent(raw: string): RunEvent | null {
  try {
    const obj = JSON.parse(raw) as unknown;
    if (
      obj &&
      typeof obj === "object" &&
      "t" in obj &&
      "seq" in obj &&
      "runId" in obj
    ) {
      return obj as RunEvent;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Wrap a browser `EventSource` as a `RunStreamSource`. Guarded so it is a no-op
 * in non-browser/test environments (where `EventSource` is undefined) — tests
 * use the mock source instead.
 */
export function eventSourceStream(url: string): RunStreamSource {
  const handlers = {
    event: (_e: RunEvent): void => {},
    open: (): void => {},
    error: (): void => {},
  };

  const ES = (globalThis as { EventSource?: typeof EventSource }).EventSource;
  if (!ES) {
    // No EventSource (SSR / test). Return an inert source; the hook will fall
    // back to its catch-up fetch and surface a connecting/error state.
    return {
      onEvent: (h) => {
        handlers.event = h;
      },
      onOpen: (h) => {
        handlers.open = h;
      },
      onError: (h) => {
        handlers.error = h;
      },
      close: () => {},
    };
  }

  const es = new ES(url);
  es.onopen = (): void => handlers.open();
  es.onerror = (): void => handlers.error();

  const forward = (msg: MessageEvent<string>): void => {
    const parsed = parseRunEvent(msg.data);
    if (parsed) handlers.event(parsed);
  };
  // The backend names every event (`event: <t>`), so a native EventSource only
  // delivers them via type-specific listeners — register one per RunEvent type.
  // `onmessage` is kept as a fallback for any future untyped (default) message.
  es.onmessage = forward;
  for (const type of RUN_EVENT_TYPES) {
    es.addEventListener(type, forward as EventListener);
  }

  return {
    onEvent: (h) => {
      handlers.event = h;
    },
    onOpen: (h) => {
      handlers.open = h;
    },
    onError: (h) => {
      handlers.error = h;
    },
    close: () => es.close(),
  };
}
