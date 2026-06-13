import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import type { Persona } from "@publisher/shared";
import { createApp } from "../../src/app.js";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { MockAgent } from "../../src/agent/mock-agent.js";
import { createFileSink } from "../../src/material/sink.js";
import { composeRunDeps } from "../../src/composition.js";
import { runsRouter } from "../../src/routes/runs.js";
import { createJwt } from "../../src/auth/jwt.js";

/**
 * publisher-2aa — the SSE run-stream needs a header-free auth path because
 * browser EventSource can't set an Authorization header. When the runs router
 * is composed with a jwtSecret, GET /runs/:id/stream must accept (and verify) a
 * `?token=` query param the same way requireAuth verifies the header.
 */

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const VOICE_SAMPLE =
  "Here's the idea, plainly. You already feel this. In plain terms — no jargon, no hedging.";

const SECRET = "run-stream-auth-secret";
const jwt = createJwt(SECRET);
const validToken = jwt.sign({ userId: "u_owner", role: "user" });

function buildApp(): { app: Express; personaId: string } {
  const db: DB = openDb(":memory:");
  runMigrations(db, loadMigrations(migrationsDir));
  const publishDir = mkdtempSync(join(tmpdir(), "publisher-stream-auth-"));
  const sink = createFileSink({ dir: publishDir, baseUrl: "" });
  const { deps, personaStore } = composeRunDeps({
    db,
    agent: new MockAgent(),
    sink,
    defaultWorkerId: "mock",
  });
  const persona: Persona = {
    id: "x",
    name: "The Essayist",
    voice: "warm, plain",
    voiceSample: VOICE_SAMPLE,
    stylePoints: ["plain terms", "no jargon"],
    keyLearnings: [],
    designElements: {},
  };
  const personaId = personaStore.create({
    name: persona.name,
    voice: persona.voice,
    voiceSample: persona.voiceSample,
    stylePoints: persona.stylePoints,
    keyLearnings: persona.keyLearnings,
    designElements: persona.designElements,
  }).id;
  const app = createApp({
    corsOrigin: "*",
    version: "test",
    routers: [{ path: "/runs", router: runsRouter(deps, { jwtSecret: SECRET }) }],
  });
  return { app, personaId };
}

/** Open the SSE stream with the given query string and collect frames until the
 * run pauses at the approval gate (escalation), then resolve the buffered body. */
function readStream(app: Express, runId: string, query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    request(app)
      .get(`/runs/${runId}/stream${query}`)
      .buffer(true)
      .parse((r, cb) => {
        let data = "";
        r.on("data", (chunk: Buffer) => {
          data += chunk.toString();
          if (data.includes("event: escalation")) r.destroy();
        });
        r.on("close", () => cb(null, data));
        r.on("end", () => cb(null, data));
      })
      .end((err, res) => {
        if (err) reject(err);
        else resolve(res.body as string);
      });
  });
}

describe("GET /runs/:id/stream — token-param auth (publisher-2aa)", () => {
  let app: Express;
  let personaId: string;
  beforeEach(() => {
    ({ app, personaId } = buildApp());
  });

  async function startRun(): Promise<string> {
    const created = await request(app)
      .post("/runs")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ personaId, concept: "On Emergence" });
    return created.body.runId as string;
  }

  it("should connect and stream when a valid ?token= is supplied", async () => {
    const runId = await startRun();
    const body = await readStream(app, runId, `?token=${validToken}`);
    expect(body).toContain("event: phase");
    expect(body).toContain("event: escalation");
  });

  it("should reject the stream with 401 when the ?token= is invalid", async () => {
    const runId = await startRun();
    const res = await request(app).get(`/runs/${runId}/stream?token=not-a-jwt`);
    expect(res.status).toBe(401);
  });

  it("should reject the stream with 401 when no token is supplied", async () => {
    const runId = await startRun();
    const res = await request(app).get(`/runs/${runId}/stream`);
    expect(res.status).toBe(401);
  });

  it("should still accept a valid Authorization header (no query token)", async () => {
    const runId = await startRun();
    const res = await request(app)
      .get(`/runs/${runId}/stream`)
      .set("Authorization", `Bearer ${validToken}`)
      .buffer(true)
      .parse((r, cb) => {
        let data = "";
        r.on("data", (chunk: Buffer) => {
          data += chunk.toString();
          if (data.includes("event: escalation")) r.destroy();
        });
        r.on("close", () => cb(null, data));
        r.on("end", () => cb(null, data));
      });
    expect(res.body as string).toContain("event: phase");
  });
});
