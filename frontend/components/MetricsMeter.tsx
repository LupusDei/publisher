/**
 * Live token / latency meter, fed from `metric` events. Shows the headline
 * totals plus a per-phase breakdown so the judge can watch cost accrue in real
 * time. Renders a calm placeholder before any metric has arrived.
 */
import type { Metrics } from "@publisher/shared";
import { totalTokens, totalLatencyMs } from "@/app/runs/run-state";

export interface MetricsMeterProps {
  metrics?: Metrics | undefined;
}

const PHASES = ["research", "build", "refine"] as const;

export function MetricsMeter({ metrics }: MetricsMeterProps): React.ReactElement {
  const tokens = totalTokens(metrics);
  const latency = totalLatencyMs(metrics);

  return (
    <section className="metrics-meter" aria-labelledby="metrics-h">
      <h3 id="metrics-h">Live meter</h3>
      <div className="meter-headline" role="status" aria-live="polite">
        <div className="meter-stat">
          <span className="meter-value">{tokens.toLocaleString()}</span>
          <span className="meter-label">tokens</span>
        </div>
        <div className="meter-stat">
          <span className="meter-value">{latency.toLocaleString()}</span>
          <span className="meter-label">ms latency</span>
        </div>
        <div className="meter-stat">
          <span className="meter-value">
            {metrics ? `${Math.round(metrics.errorRate * 100)}%` : "—"}
          </span>
          <span className="meter-label">error rate</span>
        </div>
      </div>

      {metrics ? (
        <table className="meter-table">
          <thead>
            <tr>
              <th scope="col">Phase</th>
              <th scope="col">Tokens</th>
              <th scope="col">Latency</th>
              <th scope="col">Calls</th>
            </tr>
          </thead>
          <tbody>
            {PHASES.map((p) => (
              <tr key={p}>
                <th scope="row">{p}</th>
                <td>{metrics.perPhase[p].tokens.toLocaleString()}</td>
                <td>{metrics.perPhase[p].latencyMs.toLocaleString()} ms</td>
                <td>{metrics.perPhase[p].calls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-note">Waiting for the first metric…</p>
      )}
    </section>
  );
}
