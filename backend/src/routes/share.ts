import { Router, type Request, type Response } from "express";
import {
  ShareForbiddenError,
  ShareConflictError,
  type ShareService,
} from "../services/share.service.js";
import { requireAuth } from "../auth/middleware.js";

/** The slice of the run store the mint route needs to gate on ownership before
 * delegating to the service (the service re-checks, but the route returns the
 * 403 with the same not-your-run semantics as the rest of /runs). */
interface RunOwnerLookup {
  ownerOf(id: string): string | null;
  get(id: string): unknown;
}

export interface ShareRouterDeps {
  shareService: ShareService;
  runStore: RunOwnerLookup;
  /** When set, the router gates POST with `requireAuth` (production). */
  jwtSecret?: string;
}

/**
 * share.2.2 — the authed share-mint surface mounted under `/runs`.
 *
 *   POST /runs/:id/share → 200 {slug,url} | 401 | 403 | 409
 *
 * THIN handler (Constitution §4): authenticate, then delegate to the share
 * service, mapping its structured errors to status codes. The service owns the
 * ownership + published rules and idempotency; the route adds no logic.
 */
export function shareRouter(deps: ShareRouterDeps): Router {
  const router = Router();
  const { shareService, jwtSecret } = deps;

  if (jwtSecret) router.use(requireAuth(jwtSecret));

  router.post("/:id/share", (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      // Defensive: with jwtSecret set, requireAuth already 401'd. Without it
      // (test-only open mode) there is no principal to attribute the share to.
      res.status(401).json({ error: { message: "Authentication required" } });
      return;
    }
    try {
      const link = shareService.mint(req.params.id ?? "", userId);
      res.status(200).json(link);
    } catch (err: unknown) {
      if (err instanceof ShareForbiddenError) {
        res.status(403).json({ error: { message: err.message } });
        return;
      }
      if (err instanceof ShareConflictError) {
        res.status(409).json({ error: { message: err.message } });
        return;
      }
      res.status(500).json({
        error: {
          message: err instanceof Error ? err.message : "Share failed",
        },
      });
    }
  });

  return router;
}
