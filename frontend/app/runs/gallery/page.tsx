"use client";

/**
 * /runs/gallery — a simple gallery of published pages (dp0.9.4). Lists runs that
 * reached `published` and previews each at /published/:id. Each card is labelled
 * with its worker so the two-worker (R11) and two-persona (★) comparisons read
 * at a glance. Loading / empty / error states are first-class.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Run } from "@publisher/shared";
import { fetchRuns, publishedUrl } from "../run-api";
import "@/components/runs-ui.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; runs: Run[] }
  | { kind: "error"; message: string };

export default function GalleryPage(): React.ReactElement {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    fetchRuns()
      .then((runs) =>
        active &&
        setState({
          kind: "ready",
          runs: runs.filter((r) => r.status === "published"),
        }),
      )
      .catch((e: unknown) =>
        active &&
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "load failed",
        }),
      );
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="runs-shell">
      <p className="eyebrow">Publisher · Harness</p>
      <h1>Published gallery</h1>
      <nav className="runs-nav" aria-label="Runs navigation">
        <Link href="/runs">Start a run</Link>
        <Link href="/runs/demo">Demo</Link>
      </nav>

      <div role="status" aria-live="polite">
        {state.kind === "loading" && (
          <p className="empty-note">Loading published pages…</p>
        )}
        {state.kind === "error" && (
          <p role="alert" className="form-error">
            {state.message}
          </p>
        )}
        {state.kind === "ready" && state.runs.length === 0 && (
          <p className="empty-note">
            No published pages yet — publish a run and it will appear here.
          </p>
        )}
      </div>

      {state.kind === "ready" && state.runs.length > 0 && (
        <div className="gallery-grid">
          {state.runs.map((r) => (
            <article key={r.id} className="gallery-card">
              <iframe
                title={`Published page ${r.id}`}
                src={publishedUrl(`/published/${r.id}`)}
              />
              <div className="gallery-meta">
                <Link href={`/runs/${r.id}`}>{r.concept}</Link>
                <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                  worker: {r.workerId}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
