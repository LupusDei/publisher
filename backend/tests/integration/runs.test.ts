import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../../src/app.js";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createPersonaStore } from "../../src/stores/persona.store.js";
import { createRunStore } from "../../src/stores/run.store.js";
import { createRunEventStore } from "../../src/stores/run-event.store.js";
import { createWebpageStore } from "../../src/stores/webpage.store.js";
import { MockAgent } from "../../src/agent/mock-agent.js";
import { createFileSink } from "../../src/material/sink.js";
import { compilePersonaSystem } from "../../src/guardrails/compile.js";
import { runsRouter, publishedRouter } from "../../src/routes/runs.js";
import type { Express } from "express";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

describe("walking skeleton — POST /runs end-to-end", () => {
  let db: DB;
  let app: Express;
  let personaId: string;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));

    const personaStore = createPersonaStore(db);
    personaId = personaStore.create({
      name: "The Essayist",
      voice: "Measured.",
      voiceSample: "Emergence is not magic.",
      stylePoints: [],
      keyLearnings: [],
      designElements: {},
    }).id;

    const publishDir = mkdtempSync(join(tmpdir(), "publisher-runs-int-"));
    const sink = createFileSink({ dir: publishDir, baseUrl: "" });
    const deps = {
      agent: new MockAgent(),
      sink,
      personaStore,
      runStore: createRunStore(db),
      eventStore: createRunEventStore(db),
      webpageStore: createWebpageStore(db),
      compileSystem: (m: {
        persona: Parameters<typeof compilePersonaSystem>[0];
      }) => compilePersonaSystem(m.persona),
    };

    app = createApp({
      corsOrigin: "*",
      version: "test",
      routers: [
        { path: "/runs", router: runsRouter(deps) },
        { path: "/published", router: publishedRouter(sink) },
      ],
    });
  });

  it("POST /runs should run the pipe to a published event and return the run id", async () => {
    const res = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    expect(res.status).toBe(201);
    expect(typeof res.body.runId).toBe("string");
    expect(res.body.receipt.url).toContain("/published/");
  });

  it("GET /published/:id should serve the published HTML", async () => {
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const res = await request(app).get(`/published/${created.body.runId}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("<!doctype html>");
    expect(res.text).toContain("On Emergence");
  });

  it("GET /runs/:id/events should return the ordered journal ending in published", async () => {
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const res = await request(app).get(`/runs/${created.body.runId}/events`);
    expect(res.status).toBe(200);
    const events = res.body.events as Array<{ seq: number; t: string }>;
    expect(events.map((e) => e.seq)).toEqual(events.map((_e, i) => i));
    expect(events[events.length - 1]?.t).toBe("published");
  });

  it("POST /runs with an unknown persona should return a structured 404 (error path)", async () => {
    const res = await request(app)
      .post("/runs")
      .send({ personaId: "nope", concept: "x" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it("POST /runs with a missing concept should return a structured 400 (error path)", async () => {
    const res = await request(app).post("/runs").send({ personaId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("GET /published/:id for an unpublished id should return 404", async () => {
    const res = await request(app).get("/published/does-not-exist");
    expect(res.status).toBe(404);
  });
});
