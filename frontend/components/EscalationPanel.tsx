/**
 * Escalation UI (R10). On an `escalation` event the run pauses; this panel
 * surfaces the triggering alarm and the human's options: approve-anyway,
 * abort (reject), or enrich-persona (edit voice / voiceSample inline). The
 * decision POSTs to /runs/:id/decision and the run resumes.
 *
 * Buttons are real <button>s (keyboard-navigable); the enrich form is a
 * labelled, accessible inline editor.
 */
"use client";

import { useState } from "react";
import type { Escalation, EscalationOption, Persona } from "@publisher/shared";
import { AlarmCard } from "./AlarmCard";

export interface EscalationPanelProps {
  escalation: Escalation;
  /** The persona under the run, so enrich starts from its current voice. */
  persona?: Persona | undefined;
  /** Submit a decision; resolves when the POST completes. */
  onDecide: (decision: {
    choice: EscalationOption;
    payload?: { persona?: Persona };
  }) => Promise<void>;
}

const OPTION_LABEL: Record<EscalationOption, string> = {
  enrich_persona: "Enrich persona",
  approve_anyway: "Approve anyway",
  retry: "Retry",
  abort: "Reject (abort)",
};

/**
 * When the pause is the FINAL approval gate (alarm.type AWAITING_APPROVAL) the
 * panel is not an alarm — it's a "draft ready to publish" sign-off. Relabel the
 * same options in publishing language so the affordance reads correctly.
 */
const APPROVAL_OPTION_LABEL: Record<EscalationOption, string> = {
  enrich_persona: "Request changes",
  approve_anyway: "Approve & Publish",
  retry: "Retry",
  abort: "Discard",
};

export function EscalationPanel({
  escalation,
  persona,
  onDecide,
}: EscalationPanelProps): React.ReactElement {
  const [enriching, setEnriching] = useState(false);
  const [voice, setVoice] = useState(persona?.voice ?? "");
  const [voiceSample, setVoiceSample] = useState(persona?.voiceSample ?? "");
  const [submitting, setSubmitting] = useState<EscalationOption | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(
    choice: EscalationOption,
    payload?: { persona?: Persona },
  ): Promise<void> {
    setSubmitting(choice);
    setError(null);
    try {
      await onDecide(payload ? { choice, payload } : { choice });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to submit decision",
      );
      setSubmitting(null);
    }
  }

  async function submitEnrich(): Promise<void> {
    if (!persona) {
      // No base persona to enrich — still allow sending the edited fields.
      await decide("enrich_persona");
      return;
    }
    const enriched: Persona = { ...persona, voice, voiceSample };
    await decide("enrich_persona", { persona: enriched });
  }

  const options = escalation.options;
  const isApproval = escalation.alarm.type === "AWAITING_APPROVAL";
  const label = isApproval ? APPROVAL_OPTION_LABEL : OPTION_LABEL;

  return (
    <section
      className={`escalation-panel${isApproval ? " escalation-approval" : ""}`}
      // A draft-ready sign-off is NOT an alert; use a plain dialog role so
      // assistive tech doesn't announce it with alarm urgency.
      role={isApproval ? "dialog" : "alertdialog"}
      aria-labelledby="esc-h"
      aria-describedby="esc-reason"
    >
      <h3 id="esc-h">
        {isApproval
          ? "Draft ready — your sign-off publishes it"
          : "Run paused — human decision required"}
      </h3>
      <p id="esc-reason" className="escalation-reason">
        {escalation.reason}
      </p>

      <AlarmCard alarm={escalation.alarm} />

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <div className="escalation-actions">
        {options.includes("approve_anyway") && (
          <button
            type="button"
            className="btn btn-approve"
            disabled={submitting !== null}
            onClick={() => void decide("approve_anyway")}
          >
            {submitting === "approve_anyway"
              ? isApproval
                ? "Publishing…"
                : "Approving…"
              : label.approve_anyway}
          </button>
        )}

        {options.includes("enrich_persona") && (
          <button
            type="button"
            className="btn btn-enrich"
            aria-expanded={enriching}
            disabled={submitting !== null}
            onClick={() => setEnriching((e) => !e)}
          >
            {label.enrich_persona}
          </button>
        )}

        {options.includes("abort") && (
          <button
            type="button"
            className="btn btn-reject"
            disabled={submitting !== null}
            onClick={() => void decide("abort")}
          >
            {submitting === "abort"
              ? isApproval
                ? "Discarding…"
                : "Aborting…"
              : label.abort}
          </button>
        )}
      </div>

      {enriching && (
        <form
          className="enrich-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submitEnrich();
          }}
        >
          <label htmlFor="enrich-voice">Voice</label>
          <textarea
            id="enrich-voice"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            rows={2}
          />

          <label htmlFor="enrich-sample">Voice sample</label>
          <textarea
            id="enrich-sample"
            value={voiceSample}
            onChange={(e) => setVoiceSample(e.target.value)}
            rows={3}
          />

          <button
            type="submit"
            className="btn btn-approve"
            disabled={submitting !== null || voiceSample.trim().length === 0}
          >
            {submitting === "enrich_persona"
              ? isApproval
                ? "Sending back…"
                : "Resuming…"
              : isApproval
                ? "Submit changes & rebuild"
                : "Save & resume run"}
          </button>
        </form>
      )}
    </section>
  );
}
