"use client";

/**
 * /admin/observability — the system-wide aggregate view (2p3.4). Mirrors the
 * per-user layout and adds operator panels: aggregate token totals, avg/p95
 * latency, research/build/refine phase durations, the rejected-vs-published
 * ratio, and an error-tracking panel (errorsByType, color-coded by severity
 * but never by color alone — WCAG 1.4.1).
 *
 * Gating is two-layered: RequireAuth ensures a resolved session, then an admin
 * role check inside it denies non-admins (defence in depth — the backend
 * requireAdmin is the real authority; this is a UX guard so a non-admin never
 * sees a fetch attempt or a confusing blank page).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "../../auth/RequireAuth";
import { useAuth } from "../../auth/AuthContext";
import {
  fetchAdminObservability,
  type AdminObservability,
} from "../../observability/observability-api";
import {
  formatTokens,
  formatMs,
  formatRatio,
  errorSeverity,
  SEVERITY_LABEL,
  type ErrorSeverity,
} from "../../observability/format";
import "../../observability/observability.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: AdminObservability }
  | { kind: "error"; message: string };

/** Authenticated + admin-only. The session guard wraps the role guard. */
export default function AdminObservabilityPage(): React.ReactElement {
  return (
    <RequireAuth>
      <AdminGate />
    </RequireAuth>
  );
}

/** Render the admin view only for admins; otherwise an accessible denial. */
function AdminGate(): React.ReactElement {
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return (
      <div className="obs-shell">
        <div className="obs-denied" role="alert">
          <p className="eyebrow">Publisher · Observability</p>
          <h1>Admin access required</h1>
          <p>
            This page shows system-wide operations data and is limited to
            administrators. If you believe you should have access, contact your
            operator.
          </p>
          <p>
            <Link href="/observability">← Back to your usage</Link>
          </p>
        </div>
      </div>
    );
  }
  return <AdminObservabilityView />;
}

function AdminObservabilityView(): React.ReactElement {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await fetchAdminObservability();
        if (active) setState({ kind: "ready", data });
      } catch (e: unknown) {
        if (active)
          setState({
            kind: "error",
            message:
              e instanceof Error ? e.message : "Failed to load admin data.",
          });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="obs-shell">
      <p className="eyebrow">Publisher · Observability</p>
      <h1>System observability</h1>
      <p className="lead obs-lead">
        Aggregate cost, performance, and reliability across every user.
      </p>
      <nav className="obs-nav" aria-label="Observability navigation">
        <Link href="/observability">Your usage</Link>
        <Link href="/admin/observability" aria-current="page">
          System (admin)
        </Link>
        <Link href="/runs">Runs</Link>
      </nav>

      <div role="status" aria-live="polite" className="obs-status-region">
        {state.kind === "loading" && (
          <p className="obs-loading">Loading system observability…</p>
        )}
        {state.kind === "error" && (
          <p role="alert" className="obs-error">
            {state.message}
          </p>
        )}
      </div>

      {state.kind === "ready" && <AdminDashboard data={state.data} />}
    </div>
  );
}

function AdminDashboard({
  data,
}: {
  data: AdminObservability;
}): React.ReactElement {
  return (
    <div className="obs-body">
      <section className="obs-stats" aria-label="System summary">
        <Stat
          label="Aggregate tokens"
          value={formatTokens(data.tokenTotals)}
          hint="Across all users"
        />
        <Stat
          label="Published"
          value={String(data.publishedCount)}
          tone="good"
        />
        <Stat
          label="Rejected"
          value={String(data.rejectedCount)}
          {...(data.rejectedCount > 0 ? { tone: "crit" as const } : {})}
        />
        <Stat
          label="Rejected ratio"
          value={formatRatio(data.rejectedRatio)}
          hint="Rejected of all outcomes"
        />
        <Stat label="Avg latency" value={formatMs(data.latency.avgMs)} />
        <Stat label="p95 latency" value={formatMs(data.latency.p95Ms)} />
      </section>

      <section aria-labelledby="obs-phases-h">
        <h2 id="obs-phases-h" className="obs-section-h">
          Phase durations (avg)
        </h2>
        <PhaseDurationsPanel durations={data.phaseDurations} />
      </section>

      <section
        role="region"
        aria-labelledby="obs-errors-h"
        aria-label="Error tracking"
      >
        <h2 id="obs-errors-h" className="obs-section-h">
          Error tracking
        </h2>
        <ErrorTrackingPanel errorsByType={data.errorsByType} />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "crit";
}): React.ReactElement {
  return (
    <div className={`obs-stat${tone ? ` obs-stat-${tone}` : ""}`}>
      <span className="obs-stat-value">{value}</span>
      <span className="obs-stat-label">{label}</span>
      {hint && <span className="obs-stat-hint">{hint}</span>}
    </div>
  );
}

/** Phase durations as labelled bars, scaled to the slowest phase. */
function PhaseDurationsPanel({
  durations,
}: {
  durations: AdminObservability["phaseDurations"];
}): React.ReactElement {
  const phases: { name: string; ms: number }[] = [
    { name: "research", ms: durations.research },
    { name: "build", ms: durations.build },
    { name: "refine", ms: durations.refine },
  ];
  const max = Math.max(1, ...phases.map((p) => p.ms));
  return (
    <div className="obs-phases">
      {phases.map((p) => {
        const pct = Math.max(2, (p.ms / max) * 100);
        return (
          <div key={p.name} className="obs-phase-row">
            <span className="obs-phase-name">{p.name}</span>
            <span
              className="obs-phase-track"
              role="img"
              aria-label={`${p.name}: ${formatMs(p.ms)} average`}
            >
              <span
                className="obs-phase-fill"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="obs-phase-value">{formatMs(p.ms)}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Error tracking: one card per error type, color-coded by a severity bucket
 * derived from its count — but the bucket is ALSO printed as text + carried in
 * aria-label, so the panel is fully legible without color (WCAG 1.4.1). Sorted
 * by count descending so the worst offenders read first.
 */
function ErrorTrackingPanel({
  errorsByType,
}: {
  errorsByType: Record<string, number>;
}): React.ReactElement {
  const entries = Object.entries(errorsByType).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return (
      <p className="obs-empty">No errors recorded — the system is healthy.</p>
    );
  }

  return (
    <ul className="obs-errors" aria-label="Errors by type">
      {entries.map(([type, count]) => {
        const sev: ErrorSeverity = errorSeverity(count);
        return (
          <li
            key={type}
            className={`obs-error-card sev-${sev}`}
            data-severity={sev}
            aria-label={`${type}: ${count} occurrences, ${SEVERITY_LABEL[sev]} severity`}
          >
            <div className="obs-error-head">
              <span className="obs-error-type">{type}</span>
              <span className="obs-error-count">{count}</span>
            </div>
            <span className="obs-error-sev">{SEVERITY_LABEL[sev]} severity</span>
          </li>
        );
      })}
    </ul>
  );
}
