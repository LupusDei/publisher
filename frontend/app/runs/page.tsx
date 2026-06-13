"use client";

/**
 * /runs — the run control plane. Loads personas for the start-run form, starts
 * a run (POST /runs) then routes to the live run view, and lists prior runs for
 * replay (R9). First-class loading/error/empty states throughout.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Run } from "@publisher/shared";
import {
  startRun,
  fetchRuns,
  fetchPersonaSummaries,
  type PersonaSummary,
} from "./run-api";
import { StartRunForm } from "@/components/StartRunForm";
import { timeAgo, absoluteTime } from "./time-ago";
import { RequireAuth } from "../auth/RequireAuth";
import "@/components/runs-ui.css";

/** Protected route: runs are owner-scoped, so gate the control plane behind a
 * valid session. The no-backend demo at /runs/demo stays public. */
export default function RunsPage(): React.ReactElement {
  return (
    <RequireAuth>
      {/* useSearchParams() must sit inside a Suspense boundary in the App
       * Router, or the build bails on the /runs page. */}
      <Suspense fallback={null}>
        <RunsControlPlane />
      </Suspense>
    </RequireAuth>
  );
}

function RunsControlPlane(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPersonaId = searchParams.get("persona") ?? undefined;
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [personasError, setPersonasError] = useState<string | undefined>();
  const [loadingPersonas, setLoadingPersonas] = useState(true);
  const [runs, setRuns] = useState<Run[]>([]);
  const [runsError, setRunsError] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const p = await fetchPersonaSummaries();
        if (active) setPersonas(p);
      } catch (e: unknown) {
        if (active)
          setPersonasError(e instanceof Error ? e.message : "load failed");
      } finally {
        if (active) setLoadingPersonas(false);
      }
    })();
    void (async () => {
      try {
        const r = await fetchRuns();
        if (active) setRuns(r);
      } catch (e: unknown) {
        if (active)
          setRunsError(e instanceof Error ? e.message : "load failed");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="runs-shell">
      <p className="eyebrow">Publisher · Harness</p>
      <h1>Runs</h1>

      <StartRunForm
        personas={personas}
        loadingPersonas={loadingPersonas}
        personasError={personasError}
        initialPersonaId={initialPersonaId}
        onStart={async (input) => {
          const { runId } = await startRun(input);
          router.push(
            `/runs/${runId}?worker=${encodeURIComponent(input.workerId)}&persona=${encodeURIComponent(input.personaId)}`,
          );
          return { runId };
        }}
      />

      <section style={{ marginTop: 36 }} aria-labelledby="runs-list-h">
        <h2 id="runs-list-h" style={{ fontSize: 20 }}>
          Recent runs
        </h2>
        {runsError && (
          <p role="alert" className="form-error">
            {runsError}
          </p>
        )}
        {!runsError && runs.length === 0 && (
          <p className="empty-note">No runs yet — start one above.</p>
        )}
        <ul className="runs-list">
          {runs.map((r) => (
            <li key={r.id} className="run-list-item">
              <Link
                href={`/runs/${r.id}`}
                className="run-row"
                title={absoluteTime(r.createdAt)}
                aria-label={`${r.concept || "Untitled run"} — ${r.status}, ${timeAgo(
                  r.createdAt,
                )}`}
              >
                <span className={`run-status status-${r.status}`}>
                  {r.status}
                </span>
                <span className="run-concept">
                  {r.concept || "Untitled run"}
                </span>
                <time className="run-ago" dateTime={r.createdAt}>
                  {timeAgo(r.createdAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
