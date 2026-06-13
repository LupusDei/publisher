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
import { fetchRun, resumeRun } from "../run-api";
import { timeAgo, absoluteTime } from "../time-ago";
import { LiveRunPanel } from "@/components/LiveRunPanel";
import { CompiledGuardrailPanel } from "@/components/CompiledGuardrailPanel";
import { ShareLink } from "@/components/ShareLink";
import { Button } from "@/components/ui/Button";
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
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | undefined>();

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

  // Resume a run that was cut off mid-flight (publisher-kgv). The page's SSE
  // stream is already open, so once the engine re-enters it streams the new
  // events live; we just refresh the header so the status leaves "interrupted".
  async function onResume(): Promise<void> {
    setResuming(true);
    setResumeError(undefined);
    try {
      await resumeRun(runId);
      setRun(await fetchRun(runId));
    } catch (e: unknown) {
      setResumeError(e instanceof Error ? e.message : "Failed to resume");
    } finally {
      setResuming(false);
    }
  }

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
      {/* Title in the Recent-runs idiom: the concept is the prominent heading
       * with a time-ago for context; the raw UUID is not surfaced. The live
       * run status renders just below (RunView header), so it stays accurate as
       * the run progresses rather than freezing at the load-time value. */}
      <header className="run-title">
        {run?.createdAt && (
          <div className="run-title-meta">
            <time
              className="run-title-ago"
              dateTime={run.createdAt}
              title={absoluteTime(run.createdAt)}
            >
              {timeAgo(run.createdAt)}
            </time>
          </div>
        )}
        <h1 className="run-title-concept">{run?.concept || "Untitled run"}</h1>
      </header>

      {error && (
        <p role="alert" className="form-error">
          Could not load run header: {error} — streaming may still work.
        </p>
      )}

      {/* Interrupted (e.g. a backend restart cut it off) → offer to resume from
       * the furthest checkpoint reached (publisher-kgv). */}
      {run?.status === "interrupted" && (
        <section className="run-interrupted" aria-labelledby="resume-h">
          <div>
            <h2 id="resume-h" className="run-interrupted-title">
              This run was interrupted
            </h2>
            <p className="run-interrupted-body">
              It was cut off mid-run. Resume to continue from the last checkpoint
              it reached — research it already finished won&rsquo;t re-run.
            </p>
            {resumeError && (
              <p role="alert" className="form-error">
                {resumeError}
              </p>
            )}
          </div>
          <Button
            variant="primary"
            onClick={() => void onResume()}
            disabled={resuming}
          >
            {resuming ? "Resuming…" : "Resume run"}
          </Button>
        </section>
      )}

      {/* Once a run is published it can be shared publicly (share epic). */}
      {run?.status === "published" && (
        <div className="run-detail-share" style={{ marginTop: 16 }}>
          <h2 className="run-detail-share-h">Share</h2>
          <ShareLink runId={runId} />
        </div>
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
