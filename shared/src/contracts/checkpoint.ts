import { z } from "zod";
import { PersonaSchema } from "./persona.js";
import { MaterialSchema } from "./material.js";
import { ResearchResultSchema } from "./research.js";
import { WebpageSchema } from "./webpage.js";
import { AlarmSchema } from "./alarm.js";

/**
 * Checkpoints (Pillar 3) contracts. Four ordered gates, each with an explicit
 * threshold. The rich `CheckpointContext` (ASSUMPTIONS D8) keeps loop-control
 * logic in the checkpoints, not the orchestrator spine. Results carry returned
 * (never thrown) alarms (D7).
 */

/** The four ordered gates. */
export const CheckpointNameSchema = z.enum([
  "research-sufficiency",
  "voice-fidelity",
  "design-conformance",
  "quality",
]);
export type CheckpointName = z.infer<typeof CheckpointNameSchema>;

/** Explicit pass/fail for one gate on one attempt, with returned alarms. */
export const CheckpointResultSchema = z.object({
  name: CheckpointNameSchema,
  passed: z.boolean(),
  score: z.number().optional(),
  threshold: z.number().optional(),
  details: z.string(),
  autoCorrectable: z.boolean(),
  feedback: z.string().optional(),
  alarms: z.array(AlarmSchema),
});
export type CheckpointResult = z.infer<typeof CheckpointResultSchema>;

/**
 * Everything a checkpoint needs to judge an attempt. `attempt`/`priorResults`
 * let a gate reason about the loop without the orchestrator holding that state.
 */
export const CheckpointContextSchema = z.object({
  persona: PersonaSchema,
  material: MaterialSchema,
  research: ResearchResultSchema,
  webpage: WebpageSchema.optional(),
  attempt: z.number().int().nonnegative(),
  priorResults: z.array(CheckpointResultSchema),
});
export type CheckpointContext = z.infer<typeof CheckpointContextSchema>;
