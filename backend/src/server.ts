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

const VERSION = process.env["npm_package_version"] ?? "0.1.0";

/* c8 ignore start -- boot/listen wiring is exercised by integration tests, not unit-covered */
const env = loadEnv();

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
  ...(env.USE_REAL_AGENT ? {} : { defaultWorkerId: "mock" }),
});

const app = createApp({
  corsOrigin: env.CORS_ORIGIN,
  version: VERSION,
  routers: [
    // /personas hosts BOTH persona CRUD and the compiled-guardrail inspection
    // route (GET /personas/:id/compiled) — same mount path, two routers.
    { path: "/personas", router: personasRouter({ personaStore }) },
    { path: "/personas", router: guardrailsRouter({ personaStore }) },
    { path: "/runs", router: runsRouter(runsDeps) },
    { path: "/published", router: publishedRouter(sink) },
  ],
});

app.listen(env.PORT, () => {
  console.log(
    `[publisher] backend listening on :${env.PORT} (${env.NODE_ENV})`,
  );
});
/* c8 ignore stop */
