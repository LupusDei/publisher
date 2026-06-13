"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchPersonas, type Persona } from "./persona-api";

type GalleryState =
  | { kind: "loading" }
  | { kind: "ready"; personas: Persona[] }
  | { kind: "error"; message: string };

/**
 * Persona gallery — lists every authored persona (the declared guardrails) with
 * a first-class loading / error / empty state. The empty state invites the user
 * to author their first persona (US3).
 */
export default function PersonasPage(): React.ReactElement {
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
    <main style={styles.main}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Personas</p>
          <h1 style={styles.h1}>Your declared guardrails</h1>
        </div>
        <Link href="/onboarding" style={styles.primary}>
          + New persona
        </Link>
      </header>

      <div aria-live="polite">
        {state.kind === "loading" && (
          <p role="status" style={styles.muted}>
            Loading personas…
          </p>
        )}
      </div>

      <div aria-live="assertive">
        {state.kind === "error" && (
          <p role="alert" style={styles.error}>
            Couldn&apos;t load personas: {state.message}
          </p>
        )}
      </div>

      {state.kind === "ready" && state.personas.length === 0 && (
        <section style={styles.empty}>
          <h2 style={styles.emptyTitle}>No personas yet</h2>
          <p style={styles.muted}>
            A persona is the voice and design the harness enforces. Start by
            authoring one.
          </p>
          <Link href="/onboarding" style={styles.primary}>
            Create your first persona
          </Link>
        </section>
      )}

      {state.kind === "ready" && state.personas.length > 0 && (
        <ul style={styles.grid}>
          {state.personas.map((p) => (
            <li key={p.id} style={styles.card}>
              <Link href={`/personas/${p.id}`} style={styles.cardLink}>
                <h2 style={styles.cardTitle}>{p.name}</h2>
                <p style={styles.cardVoice}>{p.voice}</p>
                <p style={styles.cardSample}>&ldquo;{p.voiceSample}&rdquo;</p>
                <div style={styles.chips}>
                  {Object.entries(p.designElements).map(([k, v]) => (
                    <span key={k} style={styles.chip}>
                      {k}: {v}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 880,
    margin: "0 auto",
    padding: "32px 24px 80px",
    lineHeight: 1.5,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    gap: 16,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 12,
    color: "#6b7280",
    margin: 0,
  },
  h1: { fontSize: 30, margin: "6px 0 0" },
  primary: {
    padding: "9px 16px",
    background: "#111827",
    color: "white",
    borderRadius: 6,
    fontSize: 14,
    whiteSpace: "nowrap",
  },
  muted: { color: "#6b7280" },
  error: {
    color: "#991b1b",
    background: "#fef2f2",
    padding: "10px 12px",
    borderRadius: 6,
  },
  empty: {
    textAlign: "center",
    padding: "56px 24px",
    border: "1px dashed #d1d5db",
    borderRadius: 12,
    marginTop: 12,
  },
  emptyTitle: { margin: "0 0 8px", fontSize: 20 },
  grid: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 16,
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    overflow: "hidden",
    background: "white",
  },
  cardLink: {
    display: "block",
    padding: 18,
    color: "inherit",
    textDecoration: "none",
  },
  cardTitle: { margin: "0 0 6px", fontSize: 18 },
  cardVoice: { margin: "0 0 8px", color: "#374151", fontSize: 14 },
  cardSample: {
    margin: "0 0 12px",
    color: "#6b7280",
    fontStyle: "italic",
    fontSize: 13,
  },
  chips: { display: "flex", flexWrap: "wrap", gap: 6 },
  chip: {
    fontSize: 12,
    background: "#f3f4f6",
    borderRadius: 999,
    padding: "2px 10px",
    color: "#374151",
  },
};
