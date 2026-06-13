import { z } from "zod";
import { PersonaSchema } from "./persona.js";
import { AlarmSchema } from "./alarm.js";

/**
 * Escalation / HITL (R10). A critical alarm pauses the run and surfaces an
 * `Escalation` with the available options; the human's `EscalationDecision`
 * resumes it. Right-sized to the one demo path (ASSUMPTIONS D19): enrich/approve
 * are built; retry/abort are interface-only.
 */

export const EscalationOptionSchema = z.enum([
  "enrich_persona",
  "approve_anyway",
  "retry",
  "abort",
]);
export type EscalationOption = z.infer<typeof EscalationOptionSchema>;

/** A paused run awaiting a human decision, with the alarm that triggered it. */
export const EscalationSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  reason: z.string().min(1),
  alarm: AlarmSchema,
  options: z.array(EscalationOptionSchema).min(1),
});
export type Escalation = z.infer<typeof EscalationSchema>;

/** The human's resolution. `enrich_persona` carries the edited persona. */
export const EscalationDecisionSchema = z.object({
  escalationId: z.string().min(1),
  choice: EscalationOptionSchema,
  payload: z
    .object({
      persona: PersonaSchema.optional(),
    })
    .optional(),
});
export type EscalationDecision = z.infer<typeof EscalationDecisionSchema>;
