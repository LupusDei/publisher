/**
 * Start-a-run UI (dp0.9.1). Pick a persona (loaded by the caller), enter a
 * concept, optionally pick a worker (R11), then POST /runs. Intentional
 * loading/error/disabled states; the submit is blocked until a persona and a
 * non-empty concept are present.
 */
"use client";

import { useState } from "react";
import { AVAILABLE_WORKERS, DEFAULT_WORKER_ID } from "@/app/runs/run-api";

/** Minimal persona shape the picker needs (id + name). */
export interface PersonaOption {
  id: string;
  name: string;
}

export interface StartRunFormProps {
  personas: PersonaOption[];
  /** Submit handler; resolves with the new runId. Errors are surfaced inline. */
  onStart: (input: {
    personaId: string;
    concept: string;
    workerId: string;
  }) => Promise<{ runId: string }>;
  /** Whether the personas list is still loading (disables the form). */
  loadingPersonas?: boolean | undefined;
  /** An error loading personas, shown above the form. */
  personasError?: string | undefined;
}

export function StartRunForm({
  personas,
  onStart,
  loadingPersonas = false,
  personasError,
}: StartRunFormProps): React.ReactElement {
  const [personaId, setPersonaId] = useState("");
  const [concept, setConcept] = useState("");
  const [workerId, setWorkerId] = useState<string>(DEFAULT_WORKER_ID);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !submitting && personaId.length > 0 && concept.trim().length > 0;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onStart({ personaId, concept: concept.trim(), workerId });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="start-run-form" onSubmit={(e) => void submit(e)} aria-label="Start a run">
      <h2>Start a run</h2>

      {personasError && (
        <p role="alert" className="form-error">
          {personasError}
        </p>
      )}

      <label htmlFor="persona-select">Persona</label>
      <select
        id="persona-select"
        value={personaId}
        onChange={(e) => setPersonaId(e.target.value)}
        disabled={loadingPersonas || personas.length === 0}
      >
        <option value="">
          {loadingPersonas
            ? "Loading personas…"
            : personas.length === 0
              ? "No personas yet"
              : "Choose a persona…"}
        </option>
        {personas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <label htmlFor="concept-input">Concept</label>
      <input
        id="concept-input"
        type="text"
        value={concept}
        placeholder="e.g. On Emergence"
        onChange={(e) => setConcept(e.target.value)}
      />

      <label htmlFor="worker-select">Worker (R11 swap)</label>
      <select
        id="worker-select"
        value={workerId}
        onChange={(e) => setWorkerId(e.target.value)}
      >
        {AVAILABLE_WORKERS.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label}
          </option>
        ))}
      </select>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-approve" disabled={!canSubmit}>
        {submitting ? "Starting…" : "Start run"}
      </button>
    </form>
  );
}
