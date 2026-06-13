import { z } from "zod";

/**
 * The typed material-out contract. The agent's BUILD phase returns exactly this
 * shape (via generateObject), and the Sink publishes it as a static page.
 */
export const WebpageSchema = z.object({
  title: z.string().min(1, "title is required"),
  html: z.string().min(1, "html is required"),
  css: z.string(),
  summary: z.string(),
  sourcesUsed: z.array(z.string()),
});

export type Webpage = z.infer<typeof WebpageSchema>;
