import type { RunEvent } from "@publisher/shared";

/**
 * A tiny per-process pub/sub for live `RunEvent` tailing (SSE). The journal
 * (`run_events`) stays the SINGLE SOURCE OF TRUTH (ASSUMPTIONS D5); this bus is
 * a transient fan-out so an open SSE connection learns about a new event the
 * instant it is appended, WITHOUT polling the DB. On (re)connect the SSE route
 * first replays `loadSince` from the journal, THEN subscribes here to tail live
 * — so a missed event is impossible (the journal is authoritative; the bus is a
 * latency optimization). Process-local by design: the demo runs one backend.
 */
export interface RunEventBus {
  /** Notify all current subscribers of a freshly-appended event. */
  publish(event: RunEvent): void;
  /** Subscribe to a run's live events; returns an unsubscribe function. */
  subscribe(runId: string, listener: (event: RunEvent) => void): () => void;
}

export function createEventBus(): RunEventBus {
  const listeners = new Map<string, Set<(event: RunEvent) => void>>();

  return {
    publish(event) {
      const set = listeners.get(event.runId);
      if (!set) return;
      // Copy before iterating so an unsubscribe during dispatch is safe.
      for (const listener of [...set]) listener(event);
    },

    subscribe(runId, listener) {
      let set = listeners.get(runId);
      if (!set) {
        set = new Set();
        listeners.set(runId, set);
      }
      set.add(listener);
      return () => {
        const current = listeners.get(runId);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) listeners.delete(runId);
      };
    },
  };
}
