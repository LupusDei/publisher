"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchPersona,
  updatePersona,
  DESIGN_TOKEN_KEYS,
  DESIGN_TOKEN_META,
  type DesignTokenKey,
  type Persona,
} from "../persona-api";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; persona: Persona }
  | { kind: "error"; message: string };

type SaveState =
  | { kind: "viewing" }
  | { kind: "editing" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "saveError"; message: string };

/** One-per-line ⇄ array helpers for the array fields. */
function lines(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Persona detail — renders every declared field (voice, voiceSample, style
 * points, key learnings, design tokens) and supports inline edit/enrich (D19).
 * The id is passed by the route wrapper so the component is directly testable.
 */
export default function PersonaDetail({
  id,
}: {
  id: string;
}): React.ReactElement {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [save, setSave] = useState<SaveState>({ kind: "viewing" });

  // Editable draft fields (string forms).
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

  function seedDraft(p: Persona): void {
    setVoice(p.voice);
    setVoiceSample(p.voiceSample);
    setStylePoints(p.stylePoints.join("\n"));
    setKeyLearnings(p.keyLearnings.join("\n"));
    setTokens({
      palette: p.designElements.palette ?? "",
      typography: p.designElements.typography ?? "",
      layout: p.designElements.layout ?? "",
      tone: p.designElements.tone ?? "",
    });
  }

  useEffect(() => {
    let active = true;
    fetchPersona(id)
      .then((persona) => {
        if (!active) return;
        setLoad({ kind: "ready", persona });
        seedDraft(persona);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoad({
          kind: "error",
          message:
            err instanceof Error ? err.message : "Failed to load persona",
        });
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function onSave(): Promise<void> {
    setSave({ kind: "saving" });
    const designElements: Record<string, string> = {};
    for (const key of DESIGN_TOKEN_KEYS) {
      const v = tokens[key].trim();
      if (v.length > 0) designElements[key] = v;
    }
    try {
      const updated = await updatePersona(id, {
        voice: voice.trim(),
        voiceSample: voiceSample.trim(),
        stylePoints: lines(stylePoints),
        keyLearnings: lines(keyLearnings),
        designElements,
      });
      setLoad({ kind: "ready", persona: updated });
      seedDraft(updated);
      setSave({ kind: "saved" });
    } catch (err: unknown) {
      setSave({
        kind: "saveError",
        message: err instanceof Error ? err.message : "Failed to save",
      });
    }
  }

  if (load.kind === "loading") {
    return (
      <main style={styles.main}>
        <p role="status" style={styles.muted}>
          Loading persona…
        </p>
      </main>
    );
  }

  if (load.kind === "error") {
    return (
      <main style={styles.main}>
        <p role="alert" style={styles.error}>
          Couldn&apos;t load persona: {load.message}
        </p>
        <Link href="/personas" style={styles.back}>
          ← All personas
        </Link>
      </main>
    );
  }

  const persona = load.persona;
  const editing =
    save.kind === "editing" ||
    save.kind === "saving" ||
    save.kind === "saveError";

  return (
    <main style={styles.main}>
      <Link href="/personas" style={styles.back}>
        ← All personas
      </Link>

      <header style={styles.header}>
        <h1 style={styles.h1}>{persona.name}</h1>
        {!editing && (
          <button
            type="button"
            style={styles.secondary}
            onClick={() => setSave({ kind: "editing" })}
          >
            Edit
          </button>
        )}
      </header>

      {!editing ? (
        <ReadView persona={persona} />
      ) : (
        <form
          style={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <LabeledTextarea
            id="voice"
            label="Voice"
            value={voice}
            onChange={setVoice}
          />
          <LabeledTextarea
            id="voiceSample"
            label="Voice sample"
            value={voiceSample}
            onChange={setVoiceSample}
          />
          <LabeledTextarea
            id="stylePoints"
            label="Style points (one per line)"
            value={stylePoints}
            onChange={setStylePoints}
          />
          <LabeledTextarea
            id="keyLearnings"
            label="Key learnings (one per line)"
            value={keyLearnings}
            onChange={setKeyLearnings}
          />
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Design tokens</legend>
            <div style={styles.tokenGrid}>
              {DESIGN_TOKEN_KEYS.map((key) => (
                <div key={key} style={styles.field}>
                  <label htmlFor={`token-${key}`} style={styles.label}>
                    {DESIGN_TOKEN_META[key].label}
                  </label>
                  <input
                    id={`token-${key}`}
                    style={styles.input}
                    value={tokens[key]}
                    onChange={(e) =>
                      setTokens((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <div style={styles.actions}>
            <button
              type="submit"
              style={styles.primary}
              disabled={save.kind === "saving"}
            >
              {save.kind === "saving" ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              style={styles.secondary}
              onClick={() => {
                seedDraft(persona);
                setSave({ kind: "viewing" });
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div aria-live="polite">
        {save.kind === "saving" && (
          <p role="status" style={styles.muted}>
            Saving changes…
          </p>
        )}
        {save.kind === "saved" && (
          <p role="status" style={styles.success}>
            Saved.
          </p>
        )}
      </div>
      <div aria-live="assertive">
        {save.kind === "saveError" && (
          <p role="alert" style={styles.error}>
            Couldn&apos;t save: {save.message}
          </p>
        )}
      </div>
    </main>
  );
}

/** Read-only rendering of every declared field. */
function ReadView({ persona }: { persona: Persona }): React.ReactElement {
  const tokenEntries = Object.entries(persona.designElements);
  return (
    <div style={styles.readView}>
      <Section title="Voice">
        <p style={styles.body}>{persona.voice}</p>
      </Section>
      <Section title="Voice sample">
        <blockquote style={styles.quote}>{persona.voiceSample}</blockquote>
      </Section>
      <Section title="Style points">
        {persona.stylePoints.length > 0 ? (
          <ul style={styles.list}>
            {persona.stylePoints.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <p style={styles.muted}>None declared.</p>
        )}
      </Section>
      <Section title="Key learnings">
        {persona.keyLearnings.length > 0 ? (
          <ul style={styles.list}>
            {persona.keyLearnings.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <p style={styles.muted}>None declared.</p>
        )}
      </Section>
      <Section title="Design tokens">
        {tokenEntries.length > 0 ? (
          <dl style={styles.tokenList}>
            {tokenEntries.map(([k, v]) => (
              <div key={k} style={styles.tokenRow}>
                <dt style={styles.tokenKey}>{k}</dt>
                <dd style={styles.tokenVal}>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p style={styles.muted}>None declared.</p>
        )}
      </Section>
    </div>
  );
}

function Section(props: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>{props.title}</h2>
      {props.children}
    </section>
  );
}

function LabeledTextarea(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <div style={styles.field}>
      <label htmlFor={props.id} style={styles.label}>
        {props.label}
      </label>
      <textarea
        id={props.id}
        style={styles.textarea}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "32px 24px 80px",
    lineHeight: 1.55,
  },
  back: { fontSize: 14, color: "#2563eb", textDecoration: "none" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    margin: "12px 0 20px",
    gap: 16,
  },
  h1: { fontSize: 30, margin: 0 },
  h2: {
    fontSize: 15,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#6b7280",
    margin: "0 0 6px",
  },
  readView: { display: "flex", flexDirection: "column", gap: 22 },
  section: {},
  body: { margin: 0, color: "#111827" },
  quote: {
    margin: 0,
    padding: "10px 16px",
    borderLeft: "3px solid #d1d5db",
    color: "#374151",
    fontStyle: "italic",
    background: "#f9fafb",
  },
  list: { margin: 0, paddingLeft: 20, color: "#111827" },
  tokenList: { margin: 0 },
  tokenRow: {
    display: "flex",
    gap: 12,
    padding: "4px 0",
    borderBottom: "1px solid #f3f4f6",
  },
  tokenKey: {
    margin: 0,
    width: 120,
    color: "#6b7280",
    textTransform: "capitalize",
  },
  tokenVal: { margin: 0, color: "#111827" },
  muted: { color: "#6b7280", margin: 0 },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontWeight: 600, fontSize: 14 },
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
    minHeight: 64,
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
  actions: { display: "flex", gap: 12, alignItems: "center" },
  primary: {
    padding: "10px 18px",
    background: "#111827",
    color: "white",
    border: "none",
    borderRadius: 6,
    fontSize: 15,
    cursor: "pointer",
  },
  secondary: {
    padding: "8px 14px",
    background: "white",
    color: "#111827",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
    cursor: "pointer",
  },
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
