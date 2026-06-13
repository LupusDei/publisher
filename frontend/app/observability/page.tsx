"use client";

/**
 * /observability — the per-user cost & outcome view (2p3.2). Behind RequireAuth
 * because the numbers are owner-scoped (GET /me/observability resolves them from
 * the bearer token). Renders the user's total token cost, a per-article cost
 * table, the research-loop count, and a published-vs-failed outcome breakdown.
 * Loading / empty / error are first-class, accessible states.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "../auth/RequireAuth";
import {
  fetchUserObservability,
  type UserObservability,
} from "./observability-api";
import { formatTokens } from "./format";
import "./observability.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: UserObservability }
  | { kind: "error"; message: string };

/** Owner-scoped: gate behind a session, then render the user's own usage. */
export default function ObservabilityPage(): React.ReactElement {
  return (
    <RequireAuth>
      <UserObservabilityView />
    </RequireAuth>
  );
}

function UserObservabilityView(): React.ReactElement {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await fetchUserObservability();
        if (active) setState({ kind: "ready", data });
      } catch (e: unknown) {
        if (active)
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "Failed to load usage.",
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
      <h1>Your usage</h1>
      <p className="lead obs-lead">
        What your publishing costs in tokens, and how often it ships.
      </p>
      <nav className="obs-nav" aria-label="Observability navigation">
        <Link href="/runs">Runs</Link>
        <Link href="/observability" aria-current="page">
          Your usage
        </Link>
      </nav>

      <div role="status" aria-live="polite" className="obs-status-region">
        {state.kind === "loading" && (
          <p className="obs-loading">Loading your usage…</p>
        )}
        {state.kind === "error" && (
          <p role="alert" className="obs-error">
            {state.message}
          </p>
        )}
      </div>

      {state.kind === "ready" && <UserDashboard data={state.data} />}
    </div>
  );
}

function UserDashboard({
  data,
}: {
  data: UserObservability;
}): React.ReactElement {
  const total = data.publishedCount + data.failedCount;
  const hasArticles = data.perArticle.length > 0;

  return (
    <div className="obs-body">
      <section className="obs-stats" aria-label="Usage summary">
        <Stat
          label="Total tokens (published)"
          value={formatTokens(data.totalTokensPublished)}
          hint="Across every article you've shipped"
        />
        <Stat
          label="Research loops"
          value={String(data.researchLoopCount)}
          hint="Times the agent re-researched for you"
        />
        <Stat
          label="Published"
          value={String(data.publishedCount)}
          tone="good"
        />
        <Stat
          label="Failed"
          value={String(data.failedCount)}
          {...(data.failedCount > 0 ? { tone: "crit" as const } : {})}
        />
      </section>

      {total > 0 && (
        <section className="obs-outcome" aria-label="Outcome breakdown">
          <h2 className="obs-section-h">Outcomes</h2>
          <OutcomeBar
            published={data.publishedCount}
            failed={data.failedCount}
          />
        </section>
      )}

      <section aria-labelledby="obs-cost-h" className="obs-cost">
        <h2 id="obs-cost-h" className="obs-section-h">
          Per-article token cost
        </h2>
        {hasArticles ? (
          <table className="obs-table" aria-label="Per-article token cost">
            <thead>
              <tr>
                <th scope="col">Article</th>
                <th scope="col" className="obs-num">
                  Tokens
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.perArticle.map((a) => (
                <tr key={a.runId}>
                  <td>
                    <Link href={`/runs/${a.runId}`}>{a.title}</Link>
                  </td>
                  <td className="obs-num">{formatTokens(a.tokens)}</td>
                  <td>
                    <StatusPill status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="obs-empty">
            No articles yet — start a run and your token cost will appear here.
          </p>
        )}
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

/** Published / failed shown as a labelled proportion bar (not color-only). */
function OutcomeBar({
  published,
  failed,
}: {
  published: number;
  failed: number;
}): React.ReactElement {
  const total = published + failed || 1;
  const pubPct = (published / total) * 100;
  const failPct = (failed / total) * 100;
  return (
    <div
      className="obs-bar"
      role="img"
      aria-label={`${published} published, ${failed} failed`}
    >
      <span
        className="obs-bar-seg obs-bar-good"
        style={{ width: `${pubPct}%` }}
      >
        {published > 0 && <span className="obs-bar-text">{published} published</span>}
      </span>
      <span
        className="obs-bar-seg obs-bar-crit"
        style={{ width: `${failPct}%` }}
      >
        {failed > 0 && <span className="obs-bar-text">{failed} failed</span>}
      </span>
    </div>
  );
}

/** Outcome status as a pill — text + color (never color alone). */
function StatusPill({ status }: { status: string }): React.ReactElement {
  const tone =
    status === "published" ? "good" : status === "failed" ? "crit" : "muted";
  return (
    <span className={`obs-pill obs-pill-${tone}`} data-status={status}>
      {status}
    </span>
  );
}
