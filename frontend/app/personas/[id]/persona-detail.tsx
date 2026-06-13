"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  fetchPersona,
  updatePersona,
  DESIGN_TOKEN_KEYS,
  DESIGN_TOKEN_META,
  type DesignTokenKey,
  type Persona,
} from "../persona-api";
import "../personas.css";

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
      <main className="personas-shell personas-shell--reading">
        <p role="status" className="personas-status">
          Loading persona…
        </p>
      </main>
    );
  }

  if (load.kind === "error") {
    return (
      <main className="personas-shell personas-shell--reading">
        <p role="alert" className="personas-error">
          Couldn&apos;t load persona: {load.message}
        </p>
        <p>
          <Link href="/personas" className="persona-back">
            ← All personas
          </Link>
        </p>
      </main>
    );
  }

  const persona = load.persona;
  const editing =
    save.kind === "editing" ||
    save.kind === "saving" ||
    save.kind === "saveError";

  return (
    <main className="personas-shell personas-shell--reading anim-rise">
      <Link href="/personas" className="persona-back">
        ← All personas
      </Link>

      <header className="persona-detail-header">
        <div>
          <p className="personas-eyebrow">Persona</p>
          <h1 className="persona-detail-title">{persona.name}</h1>
        </div>
        {!editing && (
          <Button
            variant="ghost"
            onClick={() => setSave({ kind: "editing" })}
          >
            Edit
          </Button>
        )}
      </header>

      {!editing ? (
        <ReadView persona={persona} />
      ) : (
        <form
          className="persona-form"
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
          <fieldset className="persona-fieldset">
            <legend className="persona-legend">Design tokens</legend>
            <div className="persona-token-grid">
              {DESIGN_TOKEN_KEYS.map((key) => (
                <div key={key} className="persona-field">
                  <label htmlFor={`token-${key}`} className="persona-label">
                    {DESIGN_TOKEN_META[key].label}
                  </label>
                  <input
                    id={`token-${key}`}
                    className="persona-input"
                    placeholder={DESIGN_TOKEN_META[key].placeholder}
                    value={tokens[key]}
                    onChange={(e) =>
                      setTokens((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <div className="persona-actions">
            <Button
              type="submit"
              variant="primary"
              disabled={save.kind === "saving"}
            >
              {save.kind === "saving" ? "Saving…" : "Save changes"}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                seedDraft(persona);
                setSave({ kind: "viewing" });
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div aria-live="polite">
        {save.kind === "saving" && (
          <p role="status" className="personas-status">
            Saving changes…
          </p>
        )}
        {save.kind === "saved" && (
          <p role="status" className="persona-saved">
            Saved.
          </p>
        )}
      </div>
      <div aria-live="assertive">
        {save.kind === "saveError" && (
          <p role="alert" className="personas-error">
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
    <div className="persona-read">
      <Section title="Voice">
        <p className="persona-body">{persona.voice}</p>
      </Section>
      <Section title="Voice sample">
        <blockquote className="persona-voice-sample">
          {persona.voiceSample}
        </blockquote>
      </Section>
      <Section title="Style points">
        {persona.stylePoints.length > 0 ? (
          <ul className="persona-list">
            {persona.stylePoints.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="persona-muted">None declared.</p>
        )}
      </Section>
      <Section title="Key learnings">
        {persona.keyLearnings.length > 0 ? (
          <ul className="persona-list">
            {persona.keyLearnings.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="persona-muted">None declared.</p>
        )}
      </Section>
      <Section title="Design tokens">
        {tokenEntries.length > 0 ? (
          <dl className="persona-tokens">
            {tokenEntries.map(([k, v]) => (
              <div key={k} className="persona-token-row">
                <dt className="persona-token-key">{k}</dt>
                <dd className="persona-token-val">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="persona-muted">None declared.</p>
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
    <section>
      <h2 className="persona-section-title">{props.title}</h2>
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
    <div className="persona-field">
      <label htmlFor={props.id} className="persona-label">
        {props.label}
      </label>
      <textarea
        id={props.id}
        className="persona-textarea"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}
