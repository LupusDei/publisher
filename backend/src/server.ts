import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { openDb } from "./stores/db.js";
import { loadMigrations, runMigrations } from "./stores/migrate.js";
import { createAgent } from "./agent/index.js";
import { createFileSink } from "./material/sink.js";
import { composeRunDeps } from "./composition.js";
import { runsRouter, publishedRouter } from "./routes/runs.js";
import { personasRouter } from "./routes/personas.js";
import { guardrailsRouter } from "./routes/guardrails.js";
import { adminTelemetryRouter } from "./routes/admin-telemetry.js";
import { startOtel, PROMETHEUS_PORT } from "./telemetry/otel.js";
import { createTelemetry } from "./telemetry/metrics.js";
import { authRouter } from "./routes/auth.js";
import { createUserStore } from "./stores/user.store.js";
import { createJwt } from "./auth/jwt.js";
import { createAuthService } from "./services/auth.service.js";

const VERSION = process.env["npm_package_version"] ?? "0.1.0";

/* c8 ignore start -- boot/listen wiring is exercised by integration tests, not unit-covered */
const env = loadEnv();

// OTel must start BEFORE the app so auto-instrumentation can wrap http. No-op
// (returns null) unless OTEL_ENABLED=true; never throws.
const otel = startOtel();
if (otel) {
  console.log(
    `[publisher] OpenTelemetry enabled — Prometheus metrics on :${PROMETHEUS_PORT}/metrics`,
  );
}

// One shared telemetry instance: the run engine writes to it, /admin/telemetry
// reads its snapshot. Aggregates in-process regardless of OTEL_ENABLED; when
// OTel is on it also mirrors to the registered Prometheus/OTLP exporters.
const telemetry = createTelemetry();

const here = dirname(fileURLToPath(import.meta.url));
const db = openDb(env.DATABASE_PATH);
const migrationsDir = join(here, "..", "migrations");
const applied = runMigrations(db, loadMigrations(migrationsDir));
if (applied.length > 0) {
  console.log(`[publisher] applied migrations: ${applied.join(", ")}`);
}

const publishDir = join(here, "..", "published");
const sink = createFileSink({ dir: publishDir, baseUrl: env.PUBLIC_BASE_URL });

const agent = createAgent({
  USE_REAL_AGENT: env.USE_REAL_AGENT,
  ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
});

// One shared PersonaStore + the full run-deps graph (composition root).
const { deps: runsDeps, personaStore } = composeRunDeps({
  db,
  agent,
  sink,
  telemetry,
  ...(env.USE_REAL_AGENT ? {} : { defaultWorkerId: "mock" }),
});

// Auth composition root (85q.3): one UserStore + JWT bound to AUTH_JWT_SECRET.
const authService = createAuthService({
  userStore: createUserStore(db),
  jwt: createJwt(env.AUTH_JWT_SECRET),
});

const app = createApp({
  corsOrigin: env.CORS_ORIGIN,
  version: VERSION,
  onHttpDuration: (ms) => telemetry.recordHttpDuration(ms),
  routers: [
    {
      path: "/auth",
      router: authRouter({ auth: authService, jwtSecret: env.AUTH_JWT_SECRET }),
    },
    // /personas hosts BOTH persona CRUD and the compiled-guardrail inspection
    // route (GET /personas/:id/compiled) — same mount path, two routers. The
    // CRUD router is gated + owner-scoped (85q.4); the compiled-guardrail
    // inspection route stays open (read-only describe of a stored persona).
    {
      path: "/personas",
      router: personasRouter({ personaStore, jwtSecret: env.AUTH_JWT_SECRET }),
    },
    { path: "/personas", router: guardrailsRouter({ personaStore }) },
    {
      path: "/runs",
      router: runsRouter(runsDeps, { jwtSecret: env.AUTH_JWT_SECRET }),
    },
    { path: "/published", router: publishedRouter(sink) },
    // Admin observability snapshot (Epic 3 consumes this). requireAdmin guard
    // stubbed until Epic 2 lands its real middleware.
    { path: "/admin/telemetry", router: adminTelemetryRouter({ telemetry }) },
  ],
});

const server = app.listen(env.PORT, () => {
  console.log(
    `[publisher] backend listening on :${env.PORT} (${env.NODE_ENV})`,
  );
});

// Flush telemetry cleanly on shutdown.
const shutdown = (): void => {
  server.close(() => {
    void (otel?.shutdown() ?? Promise.resolve()).finally(() => process.exit(0));
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
/* c8 ignore stop */
