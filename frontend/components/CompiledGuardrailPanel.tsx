/**
 * Compiled-guardrail panel (R3 — "declared → compiled" proof). Fetches
 * GET /personas/:id/compiled and shows the preventive systemPrompt fragment +
 * the detective validator list. This is how a judge SEES that guardrails are
 * declared, not implicit: this persona compiles to THIS prompt + THESE
 * validators.
 *
 * Self-contained data loader with first-class loading / error / empty states.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchCompiledGuardrails,
  type CompiledGuardrailsView,
} from "@/app/runs/run-api";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; view: CompiledGuardrailsView }
  | { kind: "error"; message: string };

export interface CompiledGuardrailPanelProps {
  personaId: string;
  /** Injectable loader for tests; defaults to the real API client. */
  load?: ((personaId: string) => Promise<CompiledGuardrailsView>) | undefined;
}

export function CompiledGuardrailPanel({
  personaId,
  load,
}: CompiledGuardrailPanelProps): React.ReactElement {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // Keep the (optional, possibly inline/unstable) loader in a ref so the effect
  // depends ONLY on personaId. Mirrors useRunStream's factoryRef pattern.
  // Without this, the default loader is a new function reference every render →
  // the effect re-runs → setState → re-render → an INFINITE /compiled fetch loop.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    const run = loadRef.current ?? ((id: string) => fetchCompiledGuardrails(id));
    run(personaId)
      .then((view) => {
        if (active) setState({ kind: "ready", view });
      })
      .catch((err: unknown) => {
        if (active)
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Failed to load",
          });
      });
    return () => {
      active = false;
    };
  }, [personaId]);

  return (
    <section className="compiled-guardrails" aria-labelledby="compiled-h">
      <h3 id="compiled-h">Compiled guardrails</h3>
      <p className="panel-sub">Declared once → enforced twice (R3)</p>

      <div role="status" aria-live="polite">
        {state.kind === "loading" && (
          <p className="empty-note">Compiling guardrails…</p>
        )}
        {state.kind === "error" && (
          <p role="alert" className="form-error">
            {state.message}
          </p>
        )}
      </div>

      {state.kind === "ready" && (
        <>
          <div className="compiled-block">
            <span className="compiled-label">
              Preventive · system prompt fragment
            </span>
            <pre className="system-prompt">{state.view.systemPrompt}</pre>
          </div>

          <div className="compiled-block">
            <span className="compiled-label">
              Detective · {state.view.validators.length} validators
            </span>
            <ul className="validator-list">
              {state.view.validators.map((v) => (
                <li key={v.rule} className="validator-item">
                  <span className="validator-rule">{v.rule}</span>
                  <span className="validator-kind">{v.kind}</span>
                  <p className="validator-desc">{v.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
