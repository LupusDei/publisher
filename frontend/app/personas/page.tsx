"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchPersonas, type Persona } from "./persona-api";
import { RequireAuth } from "../auth/RequireAuth";
import { buttonClass } from "@/components/ui/Button";
import "./personas.css";

type GalleryState =
  | { kind: "loading" }
  | { kind: "ready"; personas: Persona[] }
  | { kind: "error"; message: string };

/** How many skeleton cards to show while the gallery loads. */
const SKELETON_COUNT = 3;

/**
 * Persona gallery — lists every authored persona (the declared guardrails) with
 * a first-class loading / error / empty state. The empty state invites the user
 * to author their first persona (US3).
 */
/** Protected route: the persona gallery is owner-scoped, so gate it behind a
 * valid session (integration wiring — RequireAuth was built in 85q.5). */
export default function PersonasPage(): React.ReactElement {
  return (
    <RequireAuth>
      <PersonasGallery />
    </RequireAuth>
  );
}

function PersonasGallery(): React.ReactElement {
  const [state, setState] = useState<GalleryState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    fetchPersonas()
      .then((personas) => {
        if (active) setState({ kind: "ready", personas });
      })
      .catch((err: unknown) => {
        if (active)
          setState({
            kind: "error",
            message:
              err instanceof Error ? err.message : "Failed to load personas",
          });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="personas-shell">
      <header className="personas-masthead anim-rise">
        <div className="personas-masthead-copy">
          <p className="personas-eyebrow">Personas</p>
          <h1 className="personas-display">Your declared guardrails</h1>
          <p className="personas-lede">
            Every persona is a voice and a design the harness enforces — the
            promise that what you publish reads like you.
          </p>
          <div className="personas-rule draw-rule" aria-hidden="true" />
        </div>
        <Link href="/onboarding" className={buttonClass("primary", "md")}>
          New persona
        </Link>
      </header>

      <div aria-live="polite">
        {state.kind === "loading" && (
          <>
            <p role="status" className="personas-status">
              Loading personas…
            </p>
            <ul className="personas-grid stagger" aria-hidden="true">
              {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <li
                  key={i}
                  className="persona-skeleton shimmer"
                  style={{ ["--i" as string]: i }}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <div aria-live="assertive">
        {state.kind === "error" && (
          <p role="alert" className="personas-error">
            Couldn&apos;t load personas: {state.message}
          </p>
        )}
      </div>

      {state.kind === "ready" && state.personas.length === 0 && (
        <section className="personas-empty anim-rise">
          <h2 className="personas-empty-title">No personas yet</h2>
          <p className="personas-empty-body">
            A persona is the voice and design the harness enforces. Author your
            first one and Publisher will keep every draft true to it.
          </p>
          <Link href="/onboarding" className={buttonClass("primary", "lg")}>
            Create your first persona
          </Link>
        </section>
      )}

      {state.kind === "ready" && state.personas.length > 0 && (
        <ul className="personas-grid stagger">
          {state.personas.map((p, i) => (
            <li
              key={p.id}
              className="persona-card"
              style={{ ["--i" as string]: i }}
            >
              <Link href={`/personas/${p.id}`} className="persona-card-link">
                <h2 className="persona-card-name">{p.name}</h2>
                <p className="persona-card-voice">{p.voice}</p>
                {p.voiceSample && (
                  <p className="persona-card-sample">
                    &ldquo;{p.voiceSample}&rdquo;
                  </p>
                )}
                {Object.keys(p.designElements).length > 0 && (
                  <div className="persona-card-chips">
                    {Object.entries(p.designElements).map(([k, v]) => (
                      <span key={k} className="persona-chip">
                        <span className="persona-chip-key">{k}</span>: {v}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
