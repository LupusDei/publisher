import { z } from "zod";

/**
 * The Persona is the declared guardrail set: voice, style points, key learnings,
 * and design tokens. Authored in onboarding, compiled into a preventive prompt
 * fragment AND detective validators, and measured against by the checkpoints.
 *
 * Design elements are kept as a flexible string map at the bootstrap stage
 * (palette, typography, layout, ...); pillar epics may tighten this.
 */
export const PersonaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "persona name is required"),
  voice: z.string(),
  stylePoints: z.array(z.string()),
  keyLearnings: z.array(z.string()),
  designElements: z.record(z.string(), z.string()),
});

export type Persona = z.infer<typeof PersonaSchema>;

/** Shape used at creation time, before an id is assigned by the store. */
export const NewPersonaSchema = PersonaSchema.omit({ id: true });
export type NewPersona = z.infer<typeof NewPersonaSchema>;
