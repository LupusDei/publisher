/**
 * RunView — the orchestrating proof surface for a single run. Composes the hero
 * components around the folded view-model: header (status · worker · phase),
 * connection banner, four-pillar lanes + sealed agent (R1), live meter, draft
 * timeline + diff (R2), alarm cards (R5), escalation panel (R10), and the
 * terminal published / refused screens.
 *
 * Purely presentational over `RunView` state + a `connection` flag — the caller
 * owns the stream (useRunStream) and the decision handler.
 */
"use client";

import type { Persona, EscalationOption } from "@publisher/shared";
import type { RunView as RunViewModel } from "@/app/runs/run-state";
import { isTerminal } from "@/app/runs/run-state";
import type { ConnectionState } from "@/app/runs/use-run-stream";
import { PillarLanes } from "./PillarLanes.js";
import { MetricsMeter } from "./MetricsMeter.js";
import { DraftTimeline } from "./DraftTimeline.js";
import { AlarmCard } from "./AlarmCard.js";
import { EscalationPanel } from "./EscalationPanel.js";
import { PublishedPreview, RefusedToPublish } from "./PublishedPreview.js";
import { ConnectionBanner } from "./ConnectionBanner.js";

export interface RunViewProps {
  view: RunViewModel;
  connection: ConnectionState;
  /** The persona under the run (for the header label + enrich starting point). */
  persona?: Persona;
  workerId?: string;
  onReconnect?: () => void;
  onDecide?: (decision: {
    choice: EscalationOption;
    payload?: { persona?: Persona };
  }) => Promise<void>;
  base?: string;
}

export function RunView({
  view,
  connection,
  persona,
  workerId,
  onReconnect,
  onDecide,
  base,
}: RunViewProps): React.ReactElement {
  return (
    <div className="run-view">
      <header className="run-header">
        <div className="run-header-main">
          <span className={`run-status status-${view.status}`}>{view.status}</span>
          {view.phase && <span className="run-phase">phase: {view.phase}</span>}
        </div>
        <div className="run-header-meta">
          {persona && <span className="run-persona">persona: {persona.name}</span>}
          {workerId && <span className="run-worker">worker: {workerId}</span>}
        </div>
      </header>

      <ConnectionBanner connection={connection} onReconnect={onReconnect} />

      {/* The HERO: four pillar lanes + the sealed agent box (R1). */}
      <PillarLanes view={view} />

      <div className="run-columns">
        <div className="run-col">
          <MetricsMeter metrics={view.metrics} />
        </div>
        <div className="run-col">
          <DraftTimeline drafts={view.drafts} />
        </div>
      </div>

      {/* Structured alarm cards (R5). */}
      {view.alarms.length > 0 && (
        <section className="alarms" aria-labelledby="alarms-h">
          <h3 id="alarms-h">Alarms · {view.alarms.length}</h3>
          <div className="alarm-grid">
            {view.alarms.map((a, i) => (
              <AlarmCard key={`${a.type}-${i}`} alarm={a} />
            ))}
          </div>
        </section>
      )}

      {/* Escalation (R10) — only while a decision is pending. */}
      {view.escalation && onDecide && (
        <EscalationPanel
          escalation={view.escalation}
          persona={persona}
          onDecide={onDecide}
        />
      )}

      {/* Terminal screens. */}
      {view.status === "published" && view.receipt && (
        <PublishedPreview receipt={view.receipt} base={base} />
      )}
      {view.status === "failed" && (
        <RefusedToPublish reason={view.failureReason ?? "Unknown failure"} />
      )}

      {/* Empty state before anything streams. */}
      {!isTerminal(view.status) &&
        view.drafts.length === 0 &&
        view.alarms.length === 0 &&
        connection !== "error" && (
          <p className="empty-note run-empty">
            Waiting for the harness to act — phases, drafts, checkpoints and
            alarms will appear in the lanes above as the run proceeds.
          </p>
        )}
    </div>
  );
}
