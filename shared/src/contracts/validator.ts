import { z } from "zod";
import type { Webpage } from "./webpage.js";
import type { Persona } from "./persona.js";

/**
 * Guardrails (Pillar 2) detective half. `compile()` (Track B) emits an array of
 * `Validator`s that run against the built page; each returns findings. The
 * finding shape is frozen here so Track B and the checkpoints agree on it.
 */

/** One declared rule's verdict against a built page. */
export const ValidatorFindingSchema = z.object({
  rule: z.string().min(1),
  passed: z.boolean(),
  detail: z.string(),
});
export type ValidatorFinding = z.infer<typeof ValidatorFindingSchema>;

/**
 * A detective validator: pure function from (page, persona) to findings. Kept a
 * TS type (not a Zod schema) because functions aren't data — the *findings* are
 * the validated boundary.
 */
export type Validator = (page: Webpage, persona: Persona) => ValidatorFinding[];
