import { z } from "zod";
import { PhaseSchema, MetricsSchema } from "./metrics.js";
import { WebpageSchema } from "./webpage.js";
import { CheckpointResultSchema } from "./checkpoint.js";
import { AlarmSchema } from "./alarm.js";
import { ReceiptSchema } from "./material.js";
import { EscalationSchema, EscalationDecisionSchema } from "./escalation.js";

/**
 * Run + journal + stream contracts. `run_events` is the authoritative event log
 * (ASSUMPTIONS D5): WS is a live tail, reconnect/replay re-folds the log. Every
 * event carries an envelope `{runId, seq (monotonic per run), ts, pillar?}`
 * (D4); the `draft` variant makes every build attempt first-class — the R2
 * money shot.
 */

/** The orchestrator state machine's states. */
export const RunStatusSchema = z.enum([
  "created",
  "researching",
  "building",
  "checking",
  "refining",
  "escalated",
  // Passed every gate; the finished draft is paused for the FINAL human
  // approval gate (HITL) and publishes only on the user's sign-off.
  "awaiting_approval",
  "published",
  "failed",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** A run's persisted header row. */
export const RunSchema = z.object({
  id: z.string().min(1),
  personaId: z.string().min(1),
  concept: z.string().min(1),
  workerId: z.string().min(1),
  status: RunStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type Run = z.infer<typeof RunSchema>;

/** Which pillar a `RunEvent` belongs to — powers the four-lane UI (R1). */
export const PillarSchema = z.enum([
  "material",
  "guardrails",
  "checkpoints",
  "observability",
]);
export type Pillar = z.infer<typeof PillarSchema>;

/** Envelope fields present on every event. `seq` is monotonic per run. */
const EnvelopeShape = {
  runId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  ts: z.string().min(1),
  pillar: PillarSchema.optional(),
};

/**
 * The discriminated union of event bodies, each merged with the envelope. We
 * extend each variant's object with the envelope shape so the discriminated
 * union still keys cleanly on `t`.
 */
export const RunEventSchema = z.discriminatedUnion("t", [
  z.object({ ...EnvelopeShape, t: z.literal("phase"), phase: PhaseSchema }),
  z.object({
    ...EnvelopeShape,
    t: z.literal("draft"),
    attempt: z.number().int().nonnegative(),
    webpage: WebpageSchema,
    score: z.number().optional(),
    passed: z.boolean().optional(),
  }),
  z.object({
    ...EnvelopeShape,
    t: z.literal("checkpoint"),
    result: CheckpointResultSchema,
  }),
  z.object({ ...EnvelopeShape, t: z.literal("alarm"), alarm: AlarmSchema }),
  z.object({
    ...EnvelopeShape,
    t: z.literal("metric"),
    metrics: MetricsSchema,
  }),
  z.object({
    ...EnvelopeShape,
    t: z.literal("escalation"),
    escalation: EscalationSchema,
  }),
  z.object({
    ...EnvelopeShape,
    t: z.literal("resumed"),
    decision: EscalationDecisionSchema,
  }),
  z.object({
    ...EnvelopeShape,
    t: z.literal("published"),
    receipt: ReceiptSchema,
  }),
  z.object({ ...EnvelopeShape, t: z.literal("failed"), reason: z.string() }),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;
