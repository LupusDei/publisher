/**
 * Four-pillar-lane run stream (R1 — the HERO). Renders RunEvents in four labelled
 * lanes (Material · Guardrails · Checkpoints · Observability) keyed off the
 * event `pillar` tag, with the Agent shown as a SEALED BOX that only receives
 * system + messages + feedback. That visible separation IS the score: the judge
 * sees each pillar act while the worker stays blind.
 *
 * The lane region is aria-live=polite so assistive tech announces new events.
 */
import type { LaneEntry, RunView } from "@/app/runs/run-state";
import { PILLARS, PILLAR_LABELS } from "@/app/runs/run-state";
import type { RunEvent, Pillar } from "@publisher/shared";

/** A one-line human summary of an event for its lane chip. */
function summarize(event: RunEvent): string {
  switch (event.t) {
    case "phase":
      return `phase → ${event.phase}`;
    case "draft":
      return `draft #${event.attempt}${typeof event.score === "number" ? ` · ${event.score.toFixed(2)}` : ""}${event.passed === false ? " · fail" : event.passed ? " · pass" : ""}`;
    case "checkpoint":
      return `${event.result.name} · ${event.result.passed ? "PASS" : "FAIL"}${typeof event.result.score === "number" ? ` ${event.result.score.toFixed(2)}` : ""}`;
    case "alarm":
      return `alarm · ${event.alarm.type} (${event.alarm.severity})`;
    case "metric":
      return `metrics updated`;
    case "escalation":
      return `escalation · ${event.escalation.reason}`;
    case "resumed":
      return `resumed · ${event.decision.choice}`;
    case "published":
      return `published · ${event.receipt.bytes} bytes`;
    case "failed":
      return `failed · ${event.reason}`;
  }
}

function laneClass(event: RunEvent): string {
  if (event.t === "alarm") return `lane-entry sev-${event.alarm.severity}`;
  if (event.t === "checkpoint")
    return `lane-entry ${event.result.passed ? "ok" : "bad"}`;
  if (event.t === "draft")
    return `lane-entry ${event.passed === false ? "bad" : event.passed ? "ok" : ""}`;
  return "lane-entry";
}

function Lane({
  pillar,
  entries,
}: {
  pillar: Pillar;
  entries: LaneEntry[];
}): React.ReactElement {
  return (
    <section className="pillar-lane" aria-labelledby={`lane-${pillar}-h`}>
      <h3 id={`lane-${pillar}-h`} className="lane-head">
        {PILLAR_LABELS[pillar]}
        <span className="lane-count" aria-label={`${entries.length} events`}>
          {entries.length}
        </span>
      </h3>
      {entries.length === 0 ? (
        <p className="lane-empty">—</p>
      ) : (
        <ol className="lane-list">
          {entries.map((e) => (
            <li key={e.seq} className={laneClass(e.event)}>
              <span className="lane-seq">#{e.seq}</span>
              <span className="lane-summary">{summarize(e.event)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The agent as a sealed box: it only ever receives system + messages + feedback. */
function SealedAgentBox({
  phase,
}: {
  phase?: string | undefined;
}): React.ReactElement {
  return (
    <aside className="sealed-agent" aria-label="Agent (sealed worker)">
      <div className="sealed-head">
        <span className="sealed-lock" aria-hidden="true">
          ▣
        </span>
        Agent · sealed worker
      </div>
      <p className="sealed-note">
        Receives only <code>system</code> + <code>messages</code> +{" "}
        <code>feedback</code>. It cannot see the pillars; the harness governs
        every constraint around it.
      </p>
      <p className="sealed-phase">
        Current phase: <strong>{phase ?? "idle"}</strong>
      </p>
    </aside>
  );
}

export interface PillarLanesProps {
  view: RunView;
}

export function PillarLanes({ view }: PillarLanesProps): React.ReactElement {
  return (
    <div className="pillar-grid" role="region" aria-live="polite" aria-label="Run event stream by pillar">
      <SealedAgentBox phase={view.phase} />
      <div className="lanes">
        {PILLARS.map((p) => (
          <Lane key={p} pillar={p} entries={view.lanes[p]} />
        ))}
      </div>
    </div>
  );
}
