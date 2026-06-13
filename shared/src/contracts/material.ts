import { z } from "zod";
import { PersonaSchema } from "./persona.js";

/**
 * Material Handling (Pillar 1) contracts. `Material` is the loaded input the
 * pipe operates on; `Receipt` is the publish acknowledgement the Sink returns.
 */

/** The loaded run input: a concept plus the persona it will be voiced in. */
export const MaterialSchema = z.object({
  concept: z.string().min(1, "concept is required"),
  persona: PersonaSchema,
});
export type Material = z.infer<typeof MaterialSchema>;

/** Proof of publish: where the static page lives, its size, and which worker. */
export const ReceiptSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  publishedAt: z.string().min(1),
  workerId: z.string().min(1),
});
export type Receipt = z.infer<typeof ReceiptSchema>;
