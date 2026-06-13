"use client";

import { useEffect, useState } from "react";
import { fetchHealth, type Health } from "@/lib/api";

type ViewState =
  | { kind: "loading" }
  | { kind: "ok"; health: Health }
  | { kind: "error"; message: string };

export default function HomePage(): React.ReactElement {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    fetchHealth()
      .then((health) => {
        if (active) setState({ kind: "ok", health });
      })
      .catch((err: unknown) => {
        if (active) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <p className="eyebrow">Gauntlet AI · Harness</p>
      <h1>Publisher</h1>
      <p className="lead">
        Turn a research concept into a persona-voiced, single-page webpage —
        built by an agent, governed by a harness.
      </p>

      <section className="status-card" aria-labelledby="backend-status-heading">
        <h2
          id="backend-status-heading"
          style={{ fontSize: 14, margin: "0 0 10px", color: "var(--muted)" }}
        >
          Backend connection
        </h2>

        {/* aria-live so assistive tech announces the result when it resolves */}
        <div role="status" aria-live="polite">
          {state.kind === "loading" && (
            <div className="status-row">
              <span className="dot" aria-hidden="true" />
              <span>Checking backend…</span>
            </div>
          )}

          {state.kind === "ok" && (
            <>
              <div className="status-row">
                <span className="dot ok" aria-hidden="true" />
                <span>Backend healthy</span>
              </div>
              <p className="status-meta">
                version {state.health.version} · up {state.health.uptimeSeconds}
                s
              </p>
            </>
          )}

          {state.kind === "error" && (
            <>
              <div className="status-row">
                <span className="dot error" aria-hidden="true" />
                <span>Backend unreachable</span>
              </div>
              <p className="status-meta">{state.message}</p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
