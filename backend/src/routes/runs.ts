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
import {
  requireAuth,
  requireAuthAllowingQueryToken,
} from "../auth/middleware.js";
import type { AuthClaims } from "../auth/jwt.js";

/** The slice of the run store the route needs to scope reads by owner (85q.4).
 * Declared structurally so the router stays decoupled from the SQLite store. */
interface RunOwnerLookup {
  ownerOf(id: string): string | null;
  get(id: string): unknown;
}

/** Optional auth/ownership wiring for the runs router (85q.4). When `jwtSecret`
 * is present the router gates every route with `requireAuth`, stamps the authed
 * user on new runs, and scopes per-run reads to the owner (admins see all). The
 * test-only `runsRouterFrom(service)` path omits this and stays open. */
export interface RunRouterOptions {
  jwtSecret?: string;
  owner?: RunOwnerLookup;
}

/** Per-id ownership outcome (mirrors the persona route). */
type RunScopeResult = "ok" | "not_found" | "forbidden";

/** Decide whether the authed viewer may read run `id`. Admins see all; a
 * non-admin only their own. Un-owned runs (user_id NULL) stay visible. */
function scopeRun(
  owner: RunOwnerLookup,
  id: string,
  viewer: AuthClaims,
): RunScopeResult {
  if (!owner.get(id)) return "not_found";
  if (viewer.role === "admin") return "ok";
  const ownerId = owner.ownerOf(id);
  if (ownerId !== null && ownerId !== viewer.userId) return "forbidden";
  return "ok";
}

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
 *   POST   /runs               → start a run async, returns 202 {runId, status:"running"}
 *   GET    /runs/:id           → run status/summary
 *   GET    /runs/:id/events    → ordered journal (catch-up/replay; ?sinceSeq=N)
 *   GET    /runs/:id/stream    → SSE live RunEvents (replay then tail; D5)
 *   POST   /runs/:id/decision  → apply an EscalationDecision, resume
 *
 * Thin handlers: validate at the boundary (Rule 2), delegate to the service
 * (Rule 4). SSE (not WS) is one-way, ngrok-friendly, and reconnects via the
 * standard `Last-Event-ID` header replayed against the journal.
 */
export function runsRouter(
  deps: RunServiceDeps,
  options?: RunRouterOptions,
): Router {
  const service = createRunService(deps);
  // Default the owner-lookup to the real run store so server.ts gets scoping
  // for free; explicit options still win (tests).
  const resolved: RunRouterOptions = {
    ...(options ?? {}),
    owner: options?.owner ?? deps.runStore,
  };
  return runsRouterFrom(service, resolved);
}

/** Build the router from an existing service (lets tests share one instance).
 * When `options.jwtSecret` is set the router is gated with `requireAuth`, stamps
 * the authed user on new runs, and scopes per-run reads (85q.4). */
export function runsRouterFrom(
  service: RunService,
  options?: RunRouterOptions,
): Router {
  const router = Router();
  const jwtSecret = options?.jwtSecret;
  const owner = options?.owner;

  if (jwtSecret) {
    // The SSE stream route carries its own header-or-query-token gate (browser
    // EventSource can't set an Authorization header), so the blanket Bearer
    // gate skips it; every other route still requires a header token.
    const headerGate = requireAuth(jwtSecret);
    router.use((req, res, next) => {
      if (req.method === "GET" && /\/stream\/?$/.test(req.path)) {
        next();
        return;
      }
      headerGate(req, res, next);
    });
  }

  /** Guard a per-run route by ownership; returns true if the caller may
   * proceed. A no-op (proceeds) when auth/owner-lookup aren't wired. */
  function guardScope(req: Request, res: Response): boolean {
    if (!jwtSecret || !owner || !req.user) return true;
    const scope = scopeRun(owner, req.params.id ?? "", req.user);
    if (scope === "not_found") {
      res.status(404).json({ error: { message: "Run not found" } });
      return false;
    }
    if (scope === "forbidden") {
      res.status(403).json({ error: { message: "Not your run" } });
      return false;
    }
    return true;
  }

  router.get("/", (req, res) => {
    // Owner-scoped list (85q.4): an authed caller sees only their own runs;
    // when auth isn't wired (req.user undefined) the store returns all runs.
    res.json(service.list(req.user?.userId));
  });

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
    const userId = req.user?.userId;
    // dp0.11 — fire-and-forget: input is validated synchronously (INPUT_EMPTY →
    // 400) but the engine runs in the background. Return 202 with the runId so
    // the client can immediately open the SSE stream and watch the run live;
    // terminal/paused outcomes (including escalation) arrive over the stream.
    service
      .start({
        personaId,
        concept,
        ...(workerId ? { workerId } : {}),
        ...(userId ? { userId } : {}),
      })
      .then(({ runId }) => {
        res.status(202).json({ runId, status: "running" });
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
    if (!guardScope(req, res)) return;
    const run = service.get(req.params.id);
    if (!run) {
      res.status(404).json({ error: { message: "Run not found" } });
      return;
    }
    res.json(run);
  });

  router.get("/:id/events", (req, res) => {
    if (!guardScope(req, res)) return;
    const sinceSeq = parseSeq(req.query["sinceSeq"]);
    const events = service.events(req.params.id, sinceSeq);
    res.json({ events });
  });

  // Stream auth: when gated, verify the JWT from the Authorization header OR a
  // `?token=` query param (EventSource can't set headers). When the router is
  // composed without a jwtSecret the stream stays public (existing SSE tests).
  const streamGate = jwtSecret
    ? requireAuthAllowingQueryToken(jwtSecret)
    : (_req: Request, _res: Response, next: () => void) => next();
  router.get("/:id/stream", streamGate, (req, res) => {
    if (!guardScope(req, res)) return;
    streamRun(service, req, res);
  });

  router.post("/:id/decision", (req, res) => {
    if (!guardScope(req, res)) return;
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
