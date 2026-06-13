/**
 * Draft timeline + before/after diff (R2 — the money shot). Every build attempt
 * is an attempt card (attempt N, score, pass/fail, and the feedback that
 * produced the NEXT attempt). One click compares attempt N vs N+1 as a word
 * diff so the "VOICE_DRIFT 0.42 → feedback → 0.81 pass" change is VISIBLE.
 */
"use client";

import { useState } from "react";
import type { DraftAttempt } from "@/app/runs/run-state";
import { wordDiff, htmlToText } from "@/app/runs/diff";

function scoreLabel(score?: number): string {
  return typeof score === "number" ? score.toFixed(2) : "—";
}

interface DiffViewProps {
  before: DraftAttempt;
  after: DraftAttempt;
}

function DiffView({ before, after }: DiffViewProps): React.ReactElement {
  const tokens = wordDiff(
    htmlToText(before.webpage.html),
    htmlToText(after.webpage.html),
  );
  return (
    <div className="draft-diff" aria-label={`Diff of attempt ${before.attempt} versus attempt ${after.attempt}`}>
      <div className="diff-legend" aria-hidden="true">
        <span className="diff-removed">removed</span>
        <span className="diff-added">added</span>
      </div>
      <p className="diff-prose">
        {tokens.map((tok, idx) => {
          if (tok.op === "equal") return <span key={idx}>{tok.text}</span>;
          if (tok.op === "removed")
            return (
              <del key={idx} className="diff-removed">
                {tok.text}
              </del>
            );
          return (
            <ins key={idx} className="diff-added">
              {tok.text}
            </ins>
          );
        })}
      </p>
    </div>
  );
}

export interface DraftTimelineProps {
  drafts: DraftAttempt[];
}

export function DraftTimeline({ drafts }: DraftTimelineProps): React.ReactElement {
  // The compare selects a "from" attempt; we diff it against the next attempt.
  const [compareFrom, setCompareFrom] = useState<number | null>(null);

  if (drafts.length === 0) {
    return (
      <section className="draft-timeline" aria-labelledby="draft-timeline-h">
        <h3 id="draft-timeline-h">Draft timeline</h3>
        <p className="empty-note">No drafts yet — they appear as the agent builds.</p>
      </section>
    );
  }

  const fromIndex = drafts.findIndex((d) => d.attempt === compareFrom);
  const from = fromIndex >= 0 ? drafts[fromIndex] : undefined;
  const to = fromIndex >= 0 ? drafts[fromIndex + 1] : undefined;

  return (
    <section className="draft-timeline" aria-labelledby="draft-timeline-h">
      <h3 id="draft-timeline-h">Draft timeline · {drafts.length} attempts</h3>

      <ol className="draft-list">
        {drafts.map((d, idx) => {
          const next = drafts[idx + 1];
          const canCompare = Boolean(next);
          return (
            <li
              key={d.attempt}
              className={`draft-card ${d.passed === false ? "draft-fail" : d.passed ? "draft-pass" : ""}`}
            >
              <div className="draft-card-head">
                <span className="draft-attempt">Attempt {d.attempt}</span>
                <span className="draft-score" aria-label={`score ${scoreLabel(d.score)}`}>
                  {scoreLabel(d.score)}
                </span>
                <span
                  className={`draft-verdict ${d.passed ? "verdict-pass" : d.passed === false ? "verdict-fail" : "verdict-pending"}`}
                >
                  {d.passed ? "PASS" : d.passed === false ? "FAIL" : "pending"}
                </span>
              </div>

              <p className="draft-title">{d.webpage.title}</p>

              {d.feedbackToNext && (
                <div className="draft-feedback">
                  <span className="draft-feedback-label">
                    Feedback → attempt {d.attempt + 1}
                  </span>
                  <p>{d.feedbackToNext}</p>
                </div>
              )}

              {canCompare && (
                <button
                  type="button"
                  className="diff-toggle"
                  aria-expanded={compareFrom === d.attempt}
                  onClick={() =>
                    setCompareFrom((cur) => (cur === d.attempt ? null : d.attempt))
                  }
                >
                  {compareFrom === d.attempt
                    ? "Hide comparison"
                    : `Compare attempt ${d.attempt} → ${d.attempt + 1}`}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {from && to && <DiffView before={from} after={to} />}
    </section>
  );
}
