import express, { type Express, type Router } from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { createHealthService } from "./services/health.service.js";

/** One entry in the router registry: a mount path and the router to mount. */
export interface RouterEntry {
  path: string;
  router: Router;
}

export interface AppDeps {
  corsOrigin: string;
  version: string;
  /**
   * Extra routers to compose onto the app (ASSUMPTIONS D18). Tracks A (personas)
   * and G (runs) APPEND entries here instead of editing shared lines in this
   * file — killing the one guaranteed multi-track merge conflict.
   */
  routers?: RouterEntry[];
  /**
   * Optional per-request duration hook (ms). server.ts wires this to the
   * telemetry aggregator so /admin/telemetry can report system latency without
   * coupling this factory to OpenTelemetry. No-op when omitted.
   */
  onHttpDuration?: (ms: number) => void;
}

/**
 * Express application factory. Composes routes → services via a router registry.
 * `/health` is always registered (through the same registry mechanism); callers
 * pass any additional `routers`. The factory takes its dependencies explicitly
 * so tests construct an app without booting a server or reading the environment.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(cors({ origin: deps.corsOrigin }));
  app.use(express.json());

  // Time every request and feed the curated telemetry snapshot (system latency).
  const { onHttpDuration } = deps;
  if (onHttpDuration) {
    app.use((_req, res, next) => {
      const start = process.hrtime.bigint();
      res.on("finish", () => {
        const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
        onHttpDuration(ms);
      });
      next();
    });
  }

  const health = createHealthService({
    uptime: () => process.uptime(),
    version: deps.version,
  });

  const registry: RouterEntry[] = [
    { path: "/health", router: healthRouter(health) },
    ...(deps.routers ?? []),
  ];

  for (const { path, router } of registry) {
    app.use(path, router);
  }

  return app;
}
