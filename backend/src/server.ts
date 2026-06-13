import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { openDb } from "./stores/db.js";
import { loadMigrations, runMigrations } from "./stores/migrate.js";
import { createPersonaStore } from "./stores/persona.store.js";
import { createRunStore } from "./stores/run.store.js";
import { createRunEventStore } from "./stores/run-event.store.js";
import { createWebpageStore } from "./stores/webpage.store.js";
import { createAgent } from "./agent/index.js";
import { createFileSink } from "./material/sink.js";
import { compilePersonaSystem } from "./guardrails/compile.js";
import { runsRouter, publishedRouter } from "./routes/runs.js";

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
const sink = createFileSink({ dir: publishDir, baseUrl: "" });

const runsDeps = {
  agent: createAgent({
    USE_REAL_AGENT: env.USE_REAL_AGENT,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
  }),
  sink,
  personaStore: createPersonaStore(db),
  runStore: createRunStore(db),
  eventStore: createRunEventStore(db),
  webpageStore: createWebpageStore(db),
  compileSystem: (m: { persona: Parameters<typeof compilePersonaSystem>[0] }) =>
    compilePersonaSystem(m.persona),
};

const app = createApp({
  corsOrigin: env.CORS_ORIGIN,
  version: VERSION,
  routers: [
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
