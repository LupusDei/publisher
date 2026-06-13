import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { EscalationOptionSchema, PersonaSchema } from "@publisher/shared";
import {
  createRunService,
  InputRejectedError,
  RunNotPausedError,
  type RunService,
  type RunServiceDeps,
} from "../services/run.service.js";
import type { createFileSink } from "../material/sink.js";

const StartRunSchema = z.object({
  personaId: z.string().min(1),
  concept: z.string().min(1),
  workerId: z.string().min(1).optional(),
});

/** A decision posted by the human to resume a paused (escalated) run. */
const DecisionSchema = z.object({
  /** The escalation id from the `escalation` event (optional → service fills). */
  escalationId: z.string().min(1).optional(),
  choice: EscalationOptionSchema,
  payload: z.object({ persona: PersonaSchema.optional() }).optional(),
});

function badRequest(res: Response, message: string, issues?: unknown): void {
  res.status(400).json({ error: { message, ...(issues ? { issues } : {}) } });
}

/**
 * Runs route (Track G). The spine's HTTP surface:
 *   POST   /runs               → start a run, returns {runId, status, escalation?}
 *   GET    /runs/:id           → run status/summary
 *   GET    /runs/:id/events    → ordered journal (catch-up/replay; ?sinceSeq=N)
 *   GET    /runs/:id/stream    → SSE live RunEvents (replay then tail; D5)
 *   POST   /runs/:id/decision  → apply an EscalationDecision, resume
 *
 * Thin handlers: validate at the boundary (Rule 2), delegate to the service
 * (Rule 4). SSE (not WS) is one-way, ngrok-friendly, and reconnects via the
 * standard `Last-Event-ID` header replayed against the journal.
 */
export function runsRouter(deps: RunServiceDeps): Router {
  const service = createRunService(deps);
  return runsRouterFrom(service);
}

/** Build the router from an existing service (lets tests share one instance). */
export function runsRouterFrom(service: RunService): Router {
  const router = Router();

  router.post("/", (req, res) => {
    const parsed = StartRunSchema.safeParse(req.body);
    if (!parsed.success) {
      badRequest(
        res,
        "Invalid run request",
        parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      );
      return;
    }
    const { personaId, concept, workerId } = parsed.data;
    service
      .start({ personaId, concept, ...(workerId ? { workerId } : {}) })
      .then(({ runId, outcome }) => {
        res.status(201).json({ runId, ...outcome });
      })
      .catch((err: unknown) => {
        if (err instanceof InputRejectedError) {
          res.status(400).json({
            error: { message: err.message, alarms: err.alarms },
          });
          return;
        }
        res.status(500).json({
          error: { message: err instanceof Error ? err.message : "Run failed" },
        });
      });
  });

  router.get("/:id", (req, res) => {
    const run = service.get(req.params.id);
    if (!run) {
      res.status(404).json({ error: { message: "Run not found" } });
      return;
    }
    res.json(run);
  });

  router.get("/:id/events", (req, res) => {
    const sinceSeq = parseSeq(req.query["sinceSeq"]);
    const events = service.events(req.params.id, sinceSeq);
    res.json({ events });
  });

  router.get("/:id/stream", (req, res) => {
    streamRun(service, req, res);
  });

  router.post("/:id/decision", (req, res) => {
    const parsed = DecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      badRequest(
        res,
        "Invalid decision",
        parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      );
      return;
    }
    // The decision contract requires escalationId; derive it from the paused
    // run's latest escalation event when the client omits it (convenience).
    const escalationId =
      parsed.data.escalationId ?? latestEscalationId(service, req.params.id);
    if (!escalationId) {
      res.status(409).json({
        error: { message: "Run has no pending escalation to decide" },
      });
      return;
    }
    service
      .decide(req.params.id, {
        escalationId,
        choice: parsed.data.choice,
        ...(parsed.data.payload ? { payload: parsed.data.payload } : {}),
      })
      .then(({ outcome }) => {
        res.status(200).json(outcome);
      })
      .catch((err: unknown) => {
        if (err instanceof RunNotPausedError) {
          res.status(409).json({ error: { message: err.message } });
          return;
        }
        res.status(500).json({
          error: {
            message: err instanceof Error ? err.message : "Resume failed",
          },
        });
      });
  });

  return router;
}

/** Parse the `sinceSeq` query param to a non-negative int, or undefined. */
function parseSeq(raw: unknown): number | undefined {
  if (typeof raw !== "string") return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** The id of the most recent `escalation` event for a run, if any. */
function latestEscalationId(
  service: RunService,
  runId: string,
): string | undefined {
  const events = service.events(runId);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e && e.t === "escalation") return e.escalation.id;
  }
  return undefined;
}

/**
 * SSE handler (D5). On connect, replay the journal from `?sinceSeq` /
 * `Last-Event-ID`, set each SSE `id:` to the event `seq`, then subscribe to the
 * bus to tail live events. The stream is the journal tail — a reconnecting
 * client never misses an event because the journal replay covers the gap.
 */
function streamRun(service: RunService, req: Request, res: Response): void {
  const runId = req.params.id ?? "";
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  const lastEventId = req.header("Last-Event-ID");
  const sinceSeq =
    parseSeq(req.query["sinceSeq"]) ??
    (lastEventId ? parseSeq(lastEventId) : undefined);

  // Track the highest seq we've sent so the live tail never double-sends an
  // event the replay already covered (a race between replay and subscribe).
  let lastSentSeq = sinceSeq ?? -1;

  const send = (event: { seq: number; t: string }): void => {
    if (event.seq <= lastSentSeq) return;
    lastSentSeq = event.seq;
    res.write(`id: ${event.seq}\n`);
    res.write(`event: ${event.t}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Subscribe BEFORE replay so no event slips between the two; `send` dedupes.
  const unsubscribe = service.bus.subscribe(runId, send);
  for (const event of service.events(runId, sinceSeq)) send(event);

  req.on("close", () => {
    unsubscribe();
    res.end();
  });
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
