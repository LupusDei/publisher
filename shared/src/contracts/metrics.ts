import { z } from "zod";
import type { ZodTypeAny } from "zod";

/**
 * Telemetry contracts — REQUIRED by Observability (Pillar 4) and 6 alarm types.
 * `usage` + `finishReason` ride every agent call via AgentResult<T> (ASSUMPTIONS
 * D2); the Meter folds per-phase usage/latency into Metrics; budgets + breaches
 * drive structured alarms.
 */

/** Token accounting for a single agent call. */
export const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
});
export type Usage = z.infer<typeof UsageSchema>;

/** Why a generation stopped — `error`/`refusal`/`length` map to alarms. */
export const FinishReasonSchema = z.enum([
  "stop",
  "length",
  "tool-calls",
  "content-filter",
  "error",
  "refusal",
  "other",
]);
export type FinishReason = z.infer<typeof FinishReasonSchema>;

/** The three worker phases the harness meters separately. */
export const PhaseSchema = z.enum(["research", "build", "refine"]);
export type Phase = z.infer<typeof PhaseSchema>;

const PhaseMetricSchema = z.object({
  tokens: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  calls: z.number().int().nonnegative(),
});

/** A per-run metrics snapshot: per-phase rollup + an aggregate error rate. */
export const MetricsSchema = z.object({
  perPhase: z.object({
    research: PhaseMetricSchema,
    build: PhaseMetricSchema,
    refine: PhaseMetricSchema,
  }),
  errorRate: z.number().min(0).max(1),
});
export type Metrics = z.infer<typeof MetricsSchema>;

/** Declared per-run limits; absent fields mean "no limit on that dimension". */
export const BudgetSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  maxLatencyMs: z.number().int().positive().optional(),
});
export type Budget = z.infer<typeof BudgetSchema>;

/** A detected breach of a declared budget — fed to the AlarmEmitter. */
export const MetricBreachSchema = z.object({
  kind: z.enum(["token", "latency"]),
  phase: PhaseSchema.optional(),
  observed: z.number().nonnegative(),
  limit: z.number().nonnegative(),
});
export type MetricBreach = z.infer<typeof MetricBreachSchema>;

/**
 * The result envelope every agent call returns: the typed value plus the
 * telemetry Observability needs. A factory because the wrapped value schema
 * varies (ResearchResult, Webpage, …).
 */
export function agentResultSchema<T extends ZodTypeAny>(value: T) {
  return z.object({
    value,
    usage: UsageSchema,
    finishReason: FinishReasonSchema,
  });
}

/**
 * Inferred AgentResult type. The schema is value-specific (built via
 * `agentResultSchema`), but the TS type is generic for ergonomics at call sites.
 */
export interface AgentResult<T> {
  value: T;
  usage: Usage;
  finishReason: FinishReason;
}
