/**
 * Connection status banner for the run stream. Surfaces the live/connecting/
 * reconnecting/error/closed states explicitly (C5 — never a silent failure),
 * with a Reconnect affordance on error. Status is conveyed in TEXT, not color
 * alone (accessibility).
 */
import type { ConnectionState } from "@/app/runs/use-run-stream";

const LABEL: Record<ConnectionState, string> = {
  idle: "Idle — no run started",
  connecting: "Connecting to the run stream…",
  live: "Live",
  reconnecting: "Reconnecting — replaying from the last event…",
  error: "Connection lost",
  closed: "Stream complete",
};

export interface ConnectionBannerProps {
  connection: ConnectionState;
  onReconnect?: () => void;
}

export function ConnectionBanner({
  connection,
  onReconnect,
}: ConnectionBannerProps): React.ReactElement {
  return (
    <div
      className={`conn-banner conn-${connection}`}
      role="status"
      aria-live="polite"
      data-state={connection}
    >
      <span className="conn-dot" aria-hidden="true" />
      <span className="conn-label">{LABEL[connection]}</span>
      {connection === "error" && onReconnect && (
        <button type="button" className="btn btn-small" onClick={onReconnect}>
          Reconnect
        </button>
      )}
    </div>
  );
}
