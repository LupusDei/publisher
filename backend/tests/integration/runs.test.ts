import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../../src/app.js";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { MockAgent } from "../../src/agent/mock-agent.js";
import { createFileSink } from "../../src/material/sink.js";
import { composeRunDeps } from "../../src/composition.js";
import { runsRouter, publishedRouter } from "../../src/routes/runs.js";
import { personasRouter } from "../../src/routes/personas.js";
import { guardrailsRouter } from "../../src/routes/guardrails.js";
import type { Express } from "express";
import type { RunEvent } from "@publisher/shared";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

/** Terminal/paused event types that mean the run has stopped advancing. */
const TERMINAL = new Set(["published", "failed", "escalation"]);

/**
 * dp0.11: POST /runs is now fire-and-forget (202 → {runId}). The run advances in
 * the background, so an integration test must wait for a terminal/paused event
 * to land in the journal before asserting on it. We poll GET /runs/:id/events
 * (the authoritative log, D5) until a published/failed/escalation event appears
 * — no racing the engine, no fixed sleeps. Returns the full journal.
 */
async function awaitTerminal(app: Express, runId: string): Promise<RunEvent[]> {
  for (let i = 0; i < 200; i += 1) {
    const res = await request(app).get(`/runs/${runId}/events`);
    const events = res.body.events as RunEvent[];
    if (events.some((e) => TERMINAL.has(e.t))) return events;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Run ${runId} did not reach a terminal event in time`);
}

/** Poll until the run actually publishes (or fails). */
async function awaitPublished(
  app: Express,
  runId: string,
): Promise<RunEvent[]> {
  for (let i = 0; i < 200; i += 1) {
    const res = await request(app).get(`/runs/${runId}/events`);
    const events = res.body.events as RunEvent[];
    if (events.some((e) => e.t === "published" || e.t === "failed")) {
      return events;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Run ${runId} did not publish in time`);
}

/**
 * Drive a run through the FINAL APPROVAL GATE (dp0.13): wait for it to pause at
 * the approval escalation, POST an approve decision, then wait for `published`.
 */
async function approveToPublished(
  app: Express,
  runId: string,
): Promise<RunEvent[]> {
  const paused = await awaitTerminal(app, runId);
  const esc = [...paused].reverse().find((e) => e.t === "escalation");
  if (esc && esc.t === "escalation") {
    await request(app)
      .post(`/runs/${runId}/decision`)
      .send({ escalationId: esc.escalation.id, choice: "approve_anyway" });
  }
  return awaitPublished(app, runId);
}

/**
 * The voiceSample is chosen so the deterministic voice judge clears the
 * MockAgent's ON-voice draft (attempt 2) and rejects its OFF-voice draft
 * (attempt 1) — making the R2 drift→feedback→pass beat byte-for-byte
 * reproducible (ASSUMPTIONS D12). The on-voice mock text echoes "here / idea /
 * plainly / you / already / feel / plain / terms / jargon / hedging".
 */
const VOICE_SAMPLE =
  "Here's the idea, plainly. You already feel this. In plain terms — no jargon, no hedging.";

describe("RunEngine — POST /runs end-to-end (R2 spine proof)", () => {
  let db: DB;
  let app: Express;
  let personaId: string;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));

    const publishDir = mkdtempSync(join(tmpdir(), "publisher-runs-int-"));
    const sink = createFileSink({ dir: publishDir, baseUrl: "" });
    const { deps, personaStore } = composeRunDeps({
      db,
      agent: new MockAgent(),
      sink,
      defaultWorkerId: "mock",
    });

    personaId = personaStore.create({
      name: "The Essayist",
      voice: "warm, plain, second-person",
      voiceSample: VOICE_SAMPLE,
      stylePoints: ["plain terms", "no jargon", "no hedging"],
      keyLearnings: [],
      designElements: {},
    }).id;

    app = createApp({
      corsOrigin: "*",
      version: "test",
      routers: [
        { path: "/personas", router: personasRouter({ personaStore }) },
        { path: "/personas", router: guardrailsRouter({ personaStore }) },
        { path: "/runs", router: runsRouter(deps) },
        { path: "/published", router: publishedRouter(sink) },
      ],
    });
  });

  it("should accept a run async and return 202 + runId + running status", async () => {
    const res = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    // dp0.11: POST returns immediately (202) so the UI can open the SSE stream;
    // the terminal outcome arrives over the stream, not the POST response.
    expect(res.status).toBe(202);
    expect(typeof res.body.runId).toBe("string");
    expect(res.body.status).toBe("running");
  });

  it("should return 200 + empty array from GET /runs when there are no runs", async () => {
    // Regression (publisher-gb9.2): the frontend's fetchRuns() hits GET /runs,
    // which had no route (only /:id) and 404'd → "Failed to load runs (HTTP 404)".
    const res = await request(app).get("/runs");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it("should list a started run via GET /runs", async () => {
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const runId = created.body.runId as string;
    const res = await request(app).get("/runs");
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((r) => r.id)).toContain(runId);
  });

  it("should publish the run in the background (terminal via the journal)", async () => {
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const runId = created.body.runId as string;
    const events = await approveToPublished(app, runId);
    expect(events[events.length - 1]?.t).toBe("published");
    const run = await request(app).get(`/runs/${runId}`);
    expect(run.body.status).toBe("published");
  });

  it("should drive the R2 loop: two drafts, failing then passing voice gate, then published", async () => {
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const runId = created.body.runId as string;

    const events = await approveToPublished(app, runId);

    // Two build attempts → `draft` events for both attempts (R2).
    const drafts = events.filter((e) => e.t === "draft");
    const attempts = new Set(
      drafts.map((e) => (e.t === "draft" ? e.attempt : 0)),
    );
    expect(attempts).toEqual(new Set([1, 2]));

    // The voice-fidelity gate fails on attempt 1 and passes on attempt 2.
    const voiceResults = events.flatMap((e) =>
      e.t === "checkpoint" && e.result.name === "voice-fidelity"
        ? [e.result]
        : [],
    );
    expect(voiceResults.length).toBeGreaterThanOrEqual(2);
    expect(voiceResults[0]?.passed).toBe(false);
    expect(voiceResults[voiceResults.length - 1]?.passed).toBe(true);

    // A VOICE_DRIFT alarm fired (structured output, R5) and the run published.
    const alarmTypes = events.flatMap((e) =>
      e.t === "alarm" ? [e.alarm.type] : [],
    );
    expect(alarmTypes).toContain("VOICE_DRIFT");
    expect(events[events.length - 1]?.t).toBe("published");
  });

  it("should append events with monotonic seq starting at 0", async () => {
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const runId = created.body.runId as string;
    const events = await awaitTerminal(app, runId);
    expect(events.map((e) => e.seq)).toEqual(events.map((_e, i) => i));
  });

  it("should serve the published HTML at /published/:id", async () => {
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const runId = created.body.runId as string;
    await approveToPublished(app, runId);
    const res = await request(app).get(`/published/${runId}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("<!doctype html>");
  });

  it("should return the run status/summary from GET /runs/:id", async () => {
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const runId = created.body.runId as string;
    await approveToPublished(app, runId);
    const res = await request(app).get(`/runs/${runId}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("published");
    expect(res.body.concept).toBe("On Emergence");
  });

  it("should support ?sinceSeq catch-up on GET /runs/:id/events", async () => {
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const runId = created.body.runId as string;
    await awaitTerminal(app, runId);
    const all = (await request(app).get(`/runs/${runId}/events`)).body
      .events as RunEvent[];
    const since = (await request(app).get(`/runs/${runId}/events?sinceSeq=2`))
      .body.events as RunEvent[];
    expect(since.every((e) => e.seq > 2)).toBe(true);
    expect(since.length).toBe(all.length - 3);
  });

  it("should reject an empty concept with a 400 (error path)", async () => {
    const res = await request(app)
      .post("/runs")
      .send({ personaId, concept: " " });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("should reject an unknown persona with a 400 (Source returns INPUT_EMPTY)", async () => {
    const res = await request(app)
      .post("/runs")
      .send({ personaId: "nope", concept: "On Emergence" });
    expect(res.status).toBe(400);
    expect(res.body.error.alarms?.[0]?.type).toBe("INPUT_EMPTY");
  });

  it("should 404 GET /runs/:id for an unknown run", async () => {
    const res = await request(app).get("/runs/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("should 404 GET /published/:id for an unpublished id", async () => {
    const res = await request(app).get("/published/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("POST /runs/:id/resume (publisher-kgv)", () => {
  let db: DB;
  let app: Express;
  let deps: ReturnType<typeof composeRunDeps>["deps"];
  let personaId: string;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
    const publishDir = mkdtempSync(join(tmpdir(), "publisher-resume-int-"));
    const sink = createFileSink({ dir: publishDir, baseUrl: "" });
    const composed = composeRunDeps({
      db,
      agent: new MockAgent(),
      sink,
      defaultWorkerId: "mock",
    });
    deps = composed.deps;
    personaId = composed.personaStore.create({
      name: "The Essayist",
      voice: "warm, plain, second-person",
      voiceSample: VOICE_SAMPLE,
      stylePoints: ["plain terms", "no jargon", "no hedging"],
      keyLearnings: [],
      designElements: {},
    }).id;
    app = createApp({
      corsOrigin: "*",
      version: "test",
      routers: [{ path: "/runs", router: runsRouter(deps) }],
    });
  });

  it("should resume an interrupted run and return 202 (success path)", async () => {
    // Seed a run abandoned mid-build: interrupted + durable research, as the
    // boot reconcile would leave it after a restart.
    deps.runStore.create({
      id: "run_resumable",
      personaId,
      concept: "On Emergence",
      workerId: "mock",
    });
    deps.runStore.updateStatus("run_resumable", "interrupted");
    deps.researchStore.save("run_resumable", 1, {
      text: "durable research",
      sources: ["https://a.example", "https://b.example", "https://c.example"],
    });

    const res = await request(app).post("/runs/run_resumable/resume");
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ runId: "run_resumable", status: "running" });

    // It actually advances to a terminal/paused event (it built + checked).
    await awaitTerminal(app, "run_resumable");
  });

  it("should 404 an unknown run and 409 a run already terminal/paused (error paths)", async () => {
    const unknown = await request(app).post("/runs/nope/resume");
    expect(unknown.status).toBe(404);

    deps.runStore.create({
      id: "run_done",
      personaId,
      concept: "c",
      workerId: "mock",
    });
    deps.runStore.updateStatus("run_done", "published");
    const terminal = await request(app).post("/runs/run_done/resume");
    expect(terminal.status).toBe(409);
  });
});
