import { z } from "zod";

/**
 * The RESEARCH phase output. The agent synthesizes credible depth on a concept;
 * `sources` are the URLs it drew on (may be empty on the real path until web
 * tools land — see ASSUMPTIONS D13). Lives in `shared/` because it crosses the
 * Agent seam AND feeds the CheckpointContext (research-sufficiency gate).
 */
export const ResearchResultSchema = z.object({
  text: z.string(),
  sources: z.array(z.string()),
});

export type ResearchResult = z.infer<typeof ResearchResultSchema>;
