import { Router } from "express";
import { requireAuth, requireAdmin } from "../auth/middleware.js";
import type { ObservabilityService } from "../services/observability.service.js";

/**
 * Observability routes (Epic `publisher-2p3`). Two mirrored read surfaces:
 *   GET /me/observability      → the caller's own costs/outcomes (requireAuth)
 *   GET /admin/observability   → system aggregates + OTel snapshot (requireAdmin)
 *
 * Thin handlers (Constitution Rule 4): gate at the boundary, then serialize the
 * service result. All aggregation/composition lives in the service layer.
 */
export interface ObservabilityRouterDeps {
  service: ObservabilityService;
  /** JWT secret the gate verifies Bearer tokens against. */
  jwtSecret: string;
}

/** `GET /me/observability` — requireAuth, scoped to the authed user. */
export function meObservabilityRouter(deps: ObservabilityRouterDeps): Router {
  const router = Router();
  router.use(requireAuth(deps.jwtSecret));
  router.get("/", (req, res) => {
    // requireAuth guarantees req.user; guard defensively for the type-narrow.
    if (!req.user) {
      res.status(401).json({ error: { message: "Authentication required" } });
      return;
    }
    res.json(deps.service.userObservability(req.user.userId));
  });
  return router;
}

/** `GET /admin/observability` — requireAuth then requireAdmin, unscoped. */
export function adminObservabilityRouter(
  deps: ObservabilityRouterDeps,
): Router {
  const router = Router();
  router.use(requireAuth(deps.jwtSecret));
  router.get("/", requireAdmin, (_req, res) => {
    res.json(deps.service.adminObservability());
  });
  return router;
}
