import express, { type Express } from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { createHealthService } from "./services/health.service.js";

export interface AppDeps {
  corsOrigin: string;
  version: string;
}

/**
 * Express application factory. Composes routes → services. The factory takes
 * its dependencies explicitly so tests can construct an app without booting a
 * server or reading the environment.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(cors({ origin: deps.corsOrigin }));
  app.use(express.json());

  const health = createHealthService({
    uptime: () => process.uptime(),
    version: deps.version,
  });
  app.use("/health", healthRouter(health));

  return app;
}
