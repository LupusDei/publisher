"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  createPersona,
  DESIGN_TOKEN_KEYS,
  DESIGN_TOKEN_META,
  type DesignTokenKey,
  type NewPersona,
  type Persona,
} from "../personas/persona-api";

type SubmitState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "created"; persona: Persona }
  | { kind: "error"; message: string };

/** Splits a textarea of one-per-line items into a trimmed, non-empty array. */
function lines(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Onboarding — the guided form that authors a persona (the declared guardrail).
 * Captures voice, style points, key learnings, the required voiceSample, and
 * design tokens from the FIXED vocabulary (ASSUMPTIONS D3). Intentional
 * loading/success/error states are announced via aria-live regions.
 */
export default function OnboardingPage(): React.ReactElement {
  const [name, setName] = useState("");
  const [voice, setVoice] = useState("");
  const [voiceSample, setVoiceSample] = useState("");
  const [stylePoints, setStylePoints] = useState("");
  const [keyLearnings, setKeyLearnings] = useState("");
  const [tokens, setTokens] = useState<Record<DesignTokenKey, string>>({
    palette: "",
    typography: "",
    layout: "",
    tone: "",
  });
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const canSubmit = useMemo(
    () =>
      name.trim().length > 0 &&
      voice.trim().length > 0 &&
      voiceSample.trim().length > 0 &&
      state.kind !== "saving",
    [name, voice, voiceSample, state.kind],
  );

  function buildPayload(): NewPersona {
    const designElements: Record<string, string> = {};
    for (const key of DESIGN_TOKEN_KEYS) {
      const v = tokens[key].trim();
      if (v.length > 0) {
        designElements[key] = v;
      }
    }
    return {
      name: name.trim(),
      voice: voice.trim(),
      voiceSample: voiceSample.trim(),
      stylePoints: lines(stylePoints),
      keyLearnings: lines(keyLearnings),
      designElements,
    };
  }

  async function onSubmit(): Promise<void> {
    setState({ kind: "saving" });
    try {
      const persona = await createPersona(buildPayload());
      setState({ kind: "created", persona });
    } catch (err: unknown) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Failed to create persona",
      });
    }
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <p style={styles.eyebrow}>Onboarding</p>
        <h1 style={styles.h1}>Author a persona</h1>
        <p style={styles.lede}>
          A persona is your <strong>declared guardrail</strong>: the voice,
          style, and design the harness enforces on every page. Capture it once
          — the checkpoints judge against it.
        </p>
      </header>

      <form
        style={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void onSubmit();
        }}
      >
        <Field
          id="name"
          label="Persona name"
          help="A short handle for this voice."
        >
          <input
            id="name"
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Essayist"
          />
        </Field>

        <Field
          id="voice"
          label="Voice"
          help="Describe the voice in a sentence or two."
        >
          <textarea
            id="voice"
            style={styles.textarea}
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            placeholder="Measured, first-person, fond of the em-dash."
          />
        </Field>

        <Field
          id="voiceSample"
          label="Voice sample"
          help="A short, authentic passage in this voice. The voice-fidelity checkpoint judges drafts against this — required."
        >
          <textarea
            id="voiceSample"
            style={styles.textarea}
            value={voiceSample}
            onChange={(e) => setVoiceSample(e.target.value)}
            placeholder="Write 2–3 real sentences as this persona would."
          />
        </Field>

        <Field
          id="stylePoints"
          label="Style points"
          help="One per line — concrete rules (e.g. short paragraphs)."
        >
          <textarea
            id="stylePoints"
            style={styles.textarea}
            value={stylePoints}
            onChange={(e) => setStylePoints(e.target.value)}
            placeholder={"short paragraphs\none image per section"}
          />
        </Field>

        <Field
          id="keyLearnings"
          label="Key learnings"
          help="One per line — convictions this persona writes from."
        >
          <textarea
            id="keyLearnings"
            style={styles.textarea}
            value={keyLearnings}
            onChange={(e) => setKeyLearnings(e.target.value)}
            placeholder={
              "emergence is not magic\nattention is the scarce resource"
            }
          />
        </Field>

        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>Design tokens</legend>
          <p style={styles.help}>
            A fixed vocabulary so the harness can validate the page&apos;s
            design. Leave any blank.
          </p>
          <div style={styles.tokenGrid}>
            {DESIGN_TOKEN_KEYS.map((key) => (
              <Field
                key={key}
                id={`token-${key}`}
                label={DESIGN_TOKEN_META[key].label}
              >
                <input
                  id={`token-${key}`}
                  style={styles.input}
                  value={tokens[key]}
                  onChange={(e) =>
                    setTokens((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder={DESIGN_TOKEN_META[key].placeholder}
                />
              </Field>
            ))}
          </div>
        </fieldset>

        <div style={styles.actions}>
          <button type="submit" style={styles.primary} disabled={!canSubmit}>
            {state.kind === "saving" ? "Saving…" : "Create persona"}
          </button>
          <Link href="/personas" style={styles.secondary}>
            View personas
          </Link>
        </div>
      </form>

      {/* Live status region — announces loading + success to assistive tech. */}
      <div aria-live="polite">
        {state.kind === "saving" && (
          <p role="status" style={styles.status}>
            Saving — creating your persona…
          </p>
        )}
        {state.kind === "created" && (
          <p role="status" style={styles.success}>
            Created <strong>{state.persona.name}</strong>.{" "}
            <Link href={`/personas/${state.persona.id}`}>View it →</Link>
          </p>
        )}
      </div>

      <div aria-live="assertive">
        {state.kind === "error" && (
          <p role="alert" style={styles.error}>
            Couldn&apos;t create persona: {state.message}
          </p>
        )}
      </div>
    </main>
  );
}

/** A labelled field with optional help text. Keeps the form markup DRY. */
function Field(props: {
  id: string;
  label: string;
  help?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={styles.field}>
      <label htmlFor={props.id} style={styles.label}>
        {props.label}
      </label>
      {props.help ? <p style={styles.help}>{props.help}</p> : null}
      {props.children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "32px 24px 80px",
    lineHeight: 1.5,
  },
  header: { marginBottom: 28 },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 12,
    color: "#6b7280",
    margin: 0,
  },
  h1: { fontSize: 32, margin: "6px 0 10px" },
  lede: { color: "#374151", margin: 0 },
  form: { display: "flex", flexDirection: "column", gap: 20 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontWeight: 600, fontSize: 14 },
  help: { fontSize: 13, color: "#6b7280", margin: 0 },
  input: {
    padding: "8px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
  },
  textarea: {
    padding: "8px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
    minHeight: 72,
    fontFamily: "inherit",
  },
  fieldset: {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 16,
    margin: 0,
  },
  legend: { fontWeight: 700, padding: "0 6px" },
  tokenGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
    marginTop: 8,
  },
  actions: { display: "flex", gap: 12, alignItems: "center", marginTop: 4 },
  primary: {
    padding: "10px 18px",
    background: "#111827",
    color: "white",
    border: "none",
    borderRadius: 6,
    fontSize: 15,
    cursor: "pointer",
  },
  secondary: { fontSize: 14, color: "#2563eb" },
  status: { color: "#374151" },
  success: {
    color: "#065f46",
    background: "#ecfdf5",
    padding: "10px 12px",
    borderRadius: 6,
  },
  error: {
    color: "#991b1b",
    background: "#fef2f2",
    padding: "10px 12px",
    borderRadius: 6,
  },
};
