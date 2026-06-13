import { z } from "zod";

/**
 * Observability & Alarms pillar output. Alarms are structured (never thrown):
 * a named type + severity + context + recommended action. Warnings do not halt
 * a run; criticals trigger escalation.
 */
export const AlarmSeveritySchema = z.enum(["info", "warning", "critical"]);
export type AlarmSeverity = z.infer<typeof AlarmSeveritySchema>;

export const AlarmTypeSchema = z.enum([
  "INPUT_EMPTY",
  "INSUFFICIENT_RESEARCH",
  "VOICE_DRIFT",
  "DESIGN_DRIFT",
  "INSUFFICIENT_QUALITY",
  "WEBPAGE_GENERATION_FAILED",
  "TOKEN_BUDGET_EXCEEDED",
  "HIGH_LATENCY",
  "RATE_LIMITED",
  "REFUSAL",
  "OUTPUT_TRUNCATED",
  "PROVIDER_ERROR",
  "CHECKPOINT_ERROR",
]);
export type AlarmType = z.infer<typeof AlarmTypeSchema>;

export const AlarmSchema = z.object({
  type: AlarmTypeSchema,
  severity: AlarmSeveritySchema,
  context: z.record(z.string(), z.unknown()),
  recommendedAction: z.string(),
});

export type Alarm = z.infer<typeof AlarmSchema>;
