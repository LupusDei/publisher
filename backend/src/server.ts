import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { openDb } from "./stores/db.js";
import { loadMigrations, runMigrations } from "./stores/migrate.js";
import { createAgentForWorker } from "./agent/index.js";
import { createFileSink } from "./material/sink.js";
import { selectVoiceJudge } from "./checkpoints/voice-fidelity.js";
import { composeRunDeps } from "./composition.js";
import { runsRouter, publishedRouter } from "./routes/runs.js";
import { shareRouter, publicShareRouter } from "./routes/share.js";
import { personasRouter } from "./routes/personas.js";
import { guardrailsRouter } from "./routes/guardrails.js";
import { adminTelemetryRouter } from "./routes/admin-telemetry.js";
import { startOtel, PROMETHEUS_PORT } from "./telemetry/otel.js";
import { createTelemetry } from "./telemetry/metrics.js";
import { authRouter } from "./routes/auth.js";
import { createUserStore } from "./stores/user.store.js";
import { createJwt } from "./auth/jwt.js";
import { createAuthService } from "./services/auth.service.js";
import { createRunStore } from "./stores/run.store.js";
import { createMetricStore } from "./stores/metric.store.js";
import { createWebpageStore } from "./stores/webpage.store.js";
import { createObservabilityService } from "./services/observability.service.js";
import {
  meObservabilityRouter,
  adminObservabilityRouter,
} from "./routes/observability.js";

const VERSION = process.env["npm_package_version"] ?? "0.1.0";

/* c8 ignore start -- boot/listen wiring is exercised by integration tests, not unit-covered */
// Load backend/.env into process.env BEFORE reading config. Native (Node's
// process.loadEnvFile — no dependency); resolved relative to this module so it
// works from any cwd. A missing file or an older Node without the API is
// harmless: production injects real env vars directly.
try {
  process.loadEnvFile(
    join(dirname(fileURLToPath(import.meta.url)), "..", ".env"),
  );
} catch {
  // No .env (or unsupported runtime) — fall back to the ambient environment.
}

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

// PER-RUN worker selection (rrt.2.1/2.2). Instead of one startup agent (whose
// model ignored the run's workerId — the cosmetic R11 swap), thread a factory
// so each run builds the agent for ITS OWN workerId. When USE_REAL_AGENT is off
// (or no key) the factory returns the token-free MockAgent regardless of worker.
const agentFactory = (workerId: string) =>
  createAgentForWorker({
    USE_REAL_AGENT: env.USE_REAL_AGENT,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
    workerId,
  });

// Real LLM voice judge (rrt.4.1) — only the Claude-backed judge in real mode
// with a key; otherwise the deterministic judge keeps the demo/tests offline.
const voiceJudge = selectVoiceJudge({
  USE_REAL_AGENT: env.USE_REAL_AGENT,
  ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
});

// One shared PersonaStore + the full run-deps graph (composition root). The
// share graph (store + service) comes from here too so the mint route and the
// public serve route share one store and resolve against the same runs.
const {
  deps: runsDeps,
  personaStore,
  shareStore,
  shareService,
} = composeRunDeps({
  db,
  agentFactory,
  sink,
  telemetry,
  voiceJudge,
  shareBaseUrl: env.PUBLIC_BASE_URL,
  ...(env.USE_REAL_AGENT ? {} : { defaultWorkerId: "mock" }),
});
// shareStore is exposed for future route wiring (revoke/list); the mint route
// only needs the service + run-owner lookup today.
void shareStore;

// Auth composition root (85q.3): one UserStore + JWT bound to AUTH_JWT_SECRET.
const authService = createAuthService({
  userStore: createUserStore(db),
  jwt: createJwt(env.AUTH_JWT_SECRET),
});

// Observability aggregation (Epic 2p3): reads the run/metric/webpage projections
// and composes the SHARED telemetry snapshot for the admin view. Reads only — it
// adds no instrumentation (the OTel epic owns metering).
const observabilityService = createObservabilityService({
  runStore: createRunStore(db),
  metricStore: createMetricStore(db),
  webpageStore: createWebpageStore(db),
  db,
  telemetrySnapshot: () => telemetry.snapshot(),
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
    // Share mint (publisher-share.2.2) shares the /runs surface: POST
    // /runs/:id/share. Authed + owner-checked; thin over shareService.
    {
      path: "/runs",
      router: shareRouter({
        shareService,
        runStore: runsDeps.runStore,
        jwtSecret: env.AUTH_JWT_SECRET,
      }),
    },
    { path: "/published", router: publishedRouter(sink) },
    // Public, UNAUTHENTICATED preview serve (publisher-share.2.3): GET /p/:slug
    // → the run's self-contained HTML via the Sink; uniform 404 on any miss.
    { path: "/p", router: publicShareRouter({ shareService, sink }) },
    // Admin observability snapshot (Epic 3 consumes this). requireAdmin guard
    // stubbed until Epic 2 lands its real middleware.
    { path: "/admin/telemetry", router: adminTelemetryRouter({ telemetry }) },
    // Observability pages (Epic 2p3): per-user costs/outcomes (requireAuth) and
    // the system-wide aggregate + OTel snapshot (requireAdmin).
    {
      path: "/me/observability",
      router: meObservabilityRouter({
        service: observabilityService,
        jwtSecret: env.AUTH_JWT_SECRET,
      }),
    },
    {
      path: "/admin/observability",
      router: adminObservabilityRouter({
        service: observabilityService,
        jwtSecret: env.AUTH_JWT_SECRET,
      }),
    },
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
