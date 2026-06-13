"use client";

import { useState } from "react";
import {
  startRun,
  fetchRunEvents,
  publishedUrl,
  type SkeletonEvent,
} from "@/lib/api";

type ViewState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; runId: string; events: SkeletonEvent[] }
  | { kind: "error"; message: string };

/**
 * Walking-skeleton page (Track 0 minimal — Track H owns the real UI). Starts a
 * mock run, then renders the published page in an iframe plus the ordered event
 * stream. Loading and error states are first-class.
 */
export default function SkeletonPage(): React.ReactElement {
  const [personaId, setPersonaId] = useState("");
  const [concept, setConcept] = useState("On Emergence");
  const [state, setState] = useState<ViewState>({ kind: "idle" });

  async function onRun(): Promise<void> {
    setState({ kind: "running" });
    try {
      const { runId } = await startRun({ personaId, concept });
      const events = await fetchRunEvents(runId);
      setState({ kind: "done", runId, events });
    } catch (err: unknown) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: 24 }}>
      <h1>Walking Skeleton</h1>
      <p>Start a mock run, then watch it publish and stream its journal.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          aria-label="persona id"
          placeholder="persona id"
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
        />
        <input
          aria-label="concept"
          placeholder="concept"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
        />
        <button
          onClick={() => void onRun()}
          disabled={state.kind === "running" || personaId.length === 0}
        >
          Run
        </button>
      </div>

      {state.kind === "running" && <p role="status">Running the pipe…</p>}

      {state.kind === "error" && (
        <p role="alert" style={{ color: "crimson" }}>
          Error: {state.message}
        </p>
      )}

      {state.kind === "done" && (
        <section>
          <h2>Published page</h2>
          <iframe
            title="published page"
            src={publishedUrl(state.runId)}
            style={{ width: "100%", height: 320, border: "1px solid #ccc" }}
          />
          <h2>Run journal ({state.events.length} events)</h2>
          <ol>
            {state.events.map((e) => (
              <li key={e.seq}>
                <code>
                  #{e.seq} {e.t}
                  {e.pillar ? ` [${e.pillar}]` : ""}
                </code>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
