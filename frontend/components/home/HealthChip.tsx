"use client";

import { useEffect, useState } from "react";
import { fetchHealth, type Health } from "@/lib/api";

/**
 * A small, non-blocking backend status chip for the landing hero. The page is
 * finished and beautiful without this resolving — the chip simply settles in
 * with a quiet state once the health check returns.
 *
 * Preserves the three states (loading / ok / error) and the aria-live region
 * so assistive tech still announces the result when it resolves.
 */
type ChipState =
  | { kind: "loading" }
  | { kind: "ok"; health: Health }
  | { kind: "error"; message: string };

export function HealthChip(): React.ReactElement {
  const [state, setState] = useState<ChipState>({ kind: "loading" });

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
    <div
      className="home-chip"
      role="status"
      aria-live="polite"
      aria-label="Backend connection status"
    >
      {state.kind === "loading" && (
        <>
          <span className="dot" aria-hidden="true" />
          <span>Checking backend…</span>
        </>
      )}

      {state.kind === "ok" && (
        <>
          <span className="dot ok" aria-hidden="true" />
          <span>Backend healthy</span>
          <span className="home-chip-meta">
            v{state.health.version} · up {state.health.uptimeSeconds}s
          </span>
        </>
      )}

      {state.kind === "error" && (
        <>
          <span className="dot error" aria-hidden="true" />
          <span>Backend unreachable</span>
          <span className="home-chip-meta">{state.message}</span>
        </>
      )}
    </div>
  );
}
