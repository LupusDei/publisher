import type { Budget, Metrics, MetricBreach } from "@publisher/shared";

/**
 * Budget breach detection (Pillar 4). Given a declared `Budget` and a `Metrics`
 * snapshot, return the breaches as plain data — the AlarmEmitter turns these
 * into structured alarms. This path is DETERMINISTIC (ASSUMPTIONS D12): a known
 * `maxTokens` plus an over-budget run reliably yields a `token` breach, which is
 * what guarantees the on-screen `TOKEN_BUDGET_EXCEEDED` alarm (R5).
 *
 * An absent budget dimension means "no limit" on that axis. The comparison is
 * strict `>` so a run exactly at the limit does NOT breach.
 */
export function totalTokens(metrics: Metrics): number {
  const p = metrics.perPhase;
  return p.research.tokens + p.build.tokens + p.refine.tokens;
}

export function totalLatencyMs(metrics: Metrics): number {
  const p = metrics.perPhase;
  return p.research.latencyMs + p.build.latencyMs + p.refine.latencyMs;
}

export function detectBreaches(budget: Budget, metrics: Metrics): MetricBreach[] {
  const breaches: MetricBreach[] = [];

  if (budget.maxTokens !== undefined) {
    const observed = totalTokens(metrics);
    if (observed > budget.maxTokens) {
      breaches.push({ kind: "token", observed, limit: budget.maxTokens });
    }
  }

  if (budget.maxLatencyMs !== undefined) {
    const observed = totalLatencyMs(metrics);
    if (observed > budget.maxLatencyMs) {
      breaches.push({ kind: "latency", observed, limit: budget.maxLatencyMs });
    }
  }

  return breaches;
}
