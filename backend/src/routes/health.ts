import { Router } from "express";
import type { HealthService } from "../services/health.service.js";

/**
 * Health route — a thin handler that delegates to the health service.
 * No business logic lives here (Constitution Rule 4).
 */
export function healthRouter(service: HealthService): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json(service.check());
  });
  return router;
}
