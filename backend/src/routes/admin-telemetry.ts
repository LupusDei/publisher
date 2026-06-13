import { Router, type RequestHandler } from "express";
import type { Telemetry } from "../telemetry/metrics.js";

/**
 * STUB admin guard. Epic 2 will supply the real `requireAdmin` middleware
 * (auth/session-based). Until then the router falls back to this passthrough so
 * the endpoint composes without a hard dependency on auth.
 *
 * TODO(Epic 2 / requireAdmin): replace this stub by injecting the real admin
 * guard middleware via `adminTelemetryRouter({ telemetry, requireAdmin })`.
 */
const stubRequireAdmin: RequestHandler = (_req, _res, next) => {
  next();
};

export interface AdminTelemetryDeps {
  telemetry: Telemetry;
  /** Injected admin guard; defaults to the Epic 2 stub passthrough. */
  requireAdmin?: RequestHandler;
}

/**
 * Admin telemetry route — a thin handler that returns the curated telemetry
 * snapshot for the admin page. No business logic lives here (Constitution
 * Rule 4): it applies the admin guard, then serializes `telemetry.snapshot()`.
 */
export function adminTelemetryRouter(deps: AdminTelemetryDeps): Router {
  const requireAdmin = deps.requireAdmin ?? stubRequireAdmin;
  const router = Router();
  router.get("/", requireAdmin, (_req, res) => {
    res.json(deps.telemetry.snapshot());
  });
  return router;
}
