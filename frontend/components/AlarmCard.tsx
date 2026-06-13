/**
 * Structured alarm card (R5). Renders an Alarm as a card: type + severity badge
 * (color-coded, but severity is ALSO spelled out in text + an aria-label so it
 * never relies on color alone — accessibility), the structured context, and the
 * recommendedAction made prominent. Criticals are styled as blocking.
 */
import type { Alarm, AlarmSeverity } from "@publisher/shared";

const SEVERITY_LABEL: Record<AlarmSeverity, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

/** A human label for a context value (objects stringified, scalars as-is). */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export interface AlarmCardProps {
  alarm: Alarm;
}

export function AlarmCard({ alarm }: AlarmCardProps): React.ReactElement {
  const contextEntries = Object.entries(alarm.context);
  const isCritical = alarm.severity === "critical";

  return (
    <article
      className={`alarm-card alarm-${alarm.severity}`}
      data-severity={alarm.severity}
      aria-label={`${SEVERITY_LABEL[alarm.severity]} alarm: ${alarm.type}`}
    >
      <header className="alarm-head">
        <span className="alarm-type">{alarm.type}</span>
        <span
          className={`severity-badge sev-${alarm.severity}`}
          // Severity conveyed by text, not color alone (WCAG 1.4.1).
        >
          {isCritical ? "● " : ""}
          {SEVERITY_LABEL[alarm.severity]}
        </span>
      </header>

      {contextEntries.length > 0 && (
        <dl className="alarm-context">
          {contextEntries.map(([k, v]) => (
            <div key={k} className="alarm-context-row">
              <dt>{k}</dt>
              <dd>{renderValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="alarm-action">
        <span className="alarm-action-label">Recommended action</span>
        <p>{alarm.recommendedAction}</p>
      </div>

      {isCritical && (
        <p className="alarm-blocking" role="note">
          This is a blocking alarm — the run pauses for a human decision.
        </p>
      )}
    </article>
  );
}
