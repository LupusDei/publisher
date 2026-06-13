import { Router } from "express";
import { z } from "zod";
import {
  createRunService,
  PersonaNotFoundError,
  type RunServiceDeps,
} from "../services/run.service.js";
import type { createFileSink } from "../material/sink.js";

const StartRunSchema = z.object({
  personaId: z.string().min(1),
  concept: z.string().min(1),
});

/**
 * Runs route (skeleton scope): POST /runs drives the mock pipe to a published
 * page; GET /runs/:id/events returns the ordered journal. Thin handlers that
 * validate at the boundary (Rule 2) and delegate to the run service (Rule 4).
 */
export function runsRouter(deps: RunServiceDeps): Router {
  const service = createRunService(deps);
  const router = Router();

  router.post("/", (req, res) => {
    const parsed = StartRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          message: "Invalid run request",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
      });
      return;
    }
    service
      .start(parsed.data)
      .then(({ runId, receipt }) => {
        res.status(201).json({ runId, receipt });
      })
      .catch((err: unknown) => {
        if (err instanceof PersonaNotFoundError) {
          res.status(404).json({ error: { message: err.message } });
          return;
        }
        res.status(500).json({
          error: {
            message: err instanceof Error ? err.message : "Run failed",
          },
        });
      });
  });

  router.get("/:id/events", (req, res) => {
    const events = service.events(req.params.id);
    res.json({ events });
  });

  return router;
}

/**
 * Serves the published static HTML at /published/:id (ASSUMPTIONS D11). The Sink
 * owns the bytes; this route is the reachable host surface.
 */
export function publishedRouter(
  sink: ReturnType<typeof createFileSink>,
): Router {
  const router = Router();
  router.get("/:id", (req, res) => {
    const html = sink.read(req.params.id);
    if (html === null) {
      res.status(404).json({ error: { message: "Published page not found" } });
      return;
    }
    res.type("html").send(html);
  });
  return router;
}
