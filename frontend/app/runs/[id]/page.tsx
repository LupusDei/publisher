"use client";

/**
 * /runs/:id — the live run view. Streams the run via SSE (catching up on
 * reconnect), renders the four-pillar proof surface, and links the compiled
 * guardrails for the run's persona (R3). Pulls the run header for the worker
 * label; the persona is resolved for the escalation enrich starting point.
 */
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Run, Persona } from "@publisher/shared";
import { fetchRun } from "../run-api";
import { LiveRunPanel } from "@/components/LiveRunPanel";
import { CompiledGuardrailPanel } from "@/components/CompiledGuardrailPanel";
import { RequireAuth } from "../../auth/RequireAuth";
import "@/components/runs-ui.css";

/** Protected route: a run is owner-scoped, so gate the live view behind a
 * valid session. The no-backend demo at /runs/demo stays public. */
export default function RunDetailPage(): React.ReactElement {
  return (
    <RequireAuth>
      <RunDetailView />
    </RequireAuth>
  );
}

function RunDetailView(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const runId = params.id;
  const personaIdHint = search.get("persona") ?? undefined;
  const workerHint = search.get("worker") ?? undefined;

  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const r = await fetchRun(runId);
        if (active) setRun(r);
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : "load failed");
      }
    })();
    return () => {
      active = false;
    };
  }, [runId]);

  const personaId = run?.personaId ?? personaIdHint;
  const workerId = run?.workerId ?? workerHint;
  const persona: Persona | undefined = undefined; // resolved lazily on enrich

  return (
    <div className="runs-shell">
      <nav className="runs-nav" aria-label="Runs navigation">
        <Link href="/runs">← All runs</Link>
        <Link href="/runs/demo">Demo</Link>
        <Link href="/runs/gallery">Gallery</Link>
      </nav>
      <h1>Run {runId}</h1>

      {error && (
        <p role="alert" className="form-error">
          Could not load run header: {error} — streaming may still work.
        </p>
      )}

      <LiveRunPanel runId={runId} workerId={workerId} persona={persona} />

      {personaId && (
        <div style={{ marginTop: 24 }}>
          <CompiledGuardrailPanel personaId={personaId} />
        </div>
      )}
    </div>
  );
}
