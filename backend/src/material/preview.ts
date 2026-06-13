import type { createFileSink } from "./sink.js";

/** A framework-agnostic HTTP-ish response for a served published page. */
export interface PreviewResponse {
  status: 200 | 404;
  contentType: string;
  body: string;
}

/**
 * Preview serving (Pillar 1, ASSUMPTIONS D11). Given a Sink and an id, returns
 * the self-contained published page as a renderable response, or a 404 when no
 * page exists for that id. This is framework-agnostic on purpose: the skeleton's
 * `publishedRouter` (owned by Track G in `routes/runs.ts`) already wires the
 * Sink to Express; this helper lets any surface (a richer host, a static export,
 * a test) serve the exact same bytes without coupling to Express.
 */
export function servePublishedPage(
  sink: ReturnType<typeof createFileSink>,
  id: string,
): PreviewResponse {
  const html = sink.read(id);
  if (html === null) {
    return {
      status: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        error: { message: "Published page not found" },
      }),
    };
  }
  return {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: html,
  };
}
