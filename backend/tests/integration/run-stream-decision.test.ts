import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentResult,
  Persona,
  ResearchResult,
  RunEvent,
  Webpage,
} from "@publisher/shared";
import { createApp } from "../../src/app.js";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { MockAgent } from "../../src/agent/mock-agent.js";
import { createFileSink } from "../../src/material/sink.js";
import { composeRunDeps } from "../../src/composition.js";
import { runsRouter, publishedRouter } from "../../src/routes/runs.js";
import type { Agent } from "../../src/domain/index.js";
import type { Express } from "express";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const VOICE_SAMPLE =
  "Here's the idea, plainly. You already feel this. In plain terms — no jargon, no hedging.";

/**
 * dp0.11: POST /runs is fire-and-forget. Poll the journal until an event of one
 * of the given types appears (escalation surfaces via the stream/journal now,
 * not the POST response). Returns the matched event's full journal.
 */
async function awaitEvent(
  app: Express,
  runId: string,
  types: readonly string[],
): Promise<RunEvent[]> {
  const want = new Set(types);
  for (let i = 0; i < 200; i += 1) {
    const res = await request(app).get(`/runs/${runId}/events`);
    const events = res.body.events as RunEvent[];
    if (events.some((e) => want.has(e.t))) return events;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Run ${runId} did not emit ${types.join("/")} in time`);
}

/** Always off-voice so the run escalates (drives the decision endpoint). */
function offVoiceAgent(): Agent {
  const page: Webpage = {
    title: "Treatise Heretofore",
    html: "<main><h1>Furthermore</h1><p>The aforementioned scholarly treatise warrants exhaustive formal elaboration herein at considerable length and academic detail.</p></main>",
    css: "",
    summary: "A formal academic treatment in a detached register.",
    sourcesUsed: ["a", "b", "c"],
  };
  return {
    async research(): Promise<AgentResult<ResearchResult>> {
      return {
        value: {
          text: "ok",
          sources: [
            "https://a.example",
            "https://b.example",
            "https://c.example",
          ],
        },
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
        finishReason: "stop",
      };
    },
    async build(): Promise<AgentResult<Webpage>> {
      return {
        value: page,
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
        finishReason: "stop",
      };
    },
  };
}

function buildApp(agent: Agent): { app: Express; personaId: string } {
  const db: DB = openDb(":memory:");
  runMigrations(db, loadMigrations(migrationsDir));
  const publishDir = mkdtempSync(join(tmpdir(), "publisher-stream-"));
  const sink = createFileSink({ dir: publishDir, baseUrl: "" });
  const { deps, personaStore } = composeRunDeps({
    db,
    agent,
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
    routers: [
      { path: "/runs", router: runsRouter(deps) },
      { path: "/published", router: publishedRouter(sink) },
    ],
  });
  return { app, personaId };
}

describe("GET /runs/:id/stream (SSE)", () => {
  let app: Express;
  let personaId: string;
  beforeEach(() => {
    ({ app, personaId } = buildApp(new MockAgent()));
  });

  it("should replay the journal as SSE frames with id + event fields", async () => {
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const runId = created.body.runId as string;

    const res = await request(app)
      .get(`/runs/${runId}/stream`)
      .buffer(true)
      .parse((r, cb) => {
        let data = "";
        r.on("data", (chunk: Buffer) => (data += chunk.toString()));
        // The stream stays open; end it once the run pauses at the approval gate.
        r.on("data", () => {
          if (data.includes("event: escalation")) r.destroy();
        });
        r.on("close", () => cb(null, data));
        r.on("end", () => cb(null, data));
      });

    const body = res.body as string;
    expect(body).toContain("id: 0");
    expect(body).toContain("event: phase");
    // The happy run pauses at the final approval gate (surfaced as an escalation).
    expect(body).toContain("event: escalation");
  });

  it("should honor ?sinceSeq by replaying only later events", async () => {
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const runId = created.body.runId as string;

    const res = await request(app)
      .get(`/runs/${runId}/stream?sinceSeq=2`)
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

    const body = res.body as string;
    expect(body).not.toContain("id: 0\n");
    expect(body).not.toContain("id: 1\n");
    expect(body).toContain("event: escalation");
  });
});

describe("POST /runs/:id/decision (HITL resume)", () => {
  it("should start async, surface escalation over the journal, then resume with approve_anyway and publish", async () => {
    const { app, personaId } = buildApp(offVoiceAgent());
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    // dp0.11: POST is async — escalation is NOT in the POST response anymore; it
    // arrives via the stream/journal. The backgrounded paused run is still
    // resumable via the decision endpoint (the engine's pending map sees it).
    expect(created.status).toBe(202);
    expect(created.body.status).toBe("running");

    const runId = created.body.runId as string;
    const events = await awaitEvent(app, runId, ["escalation"]);
    expect(events.some((e) => e.t === "escalation")).toBe(true);

    const res = await request(app)
      .post(`/runs/${runId}/decision`)
      .send({ choice: "approve_anyway" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("published");

    const run = await request(app).get(`/runs/${runId}`);
    expect(run.body.status).toBe("published");
  });

  it("should 409 a decision when the run has no pending escalation (error path)", async () => {
    const { app, personaId } = buildApp(new MockAgent());
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const runId = created.body.runId as string;
    // This run clears all gates and pauses at the approval gate; approve it to
    // drive it to a terminal (published) state, after which it has nothing to
    // resume — a second decision must 409.
    const paused = await awaitEvent(app, runId, ["escalation"]);
    const esc = [...paused].reverse().find((e) => e.t === "escalation");
    if (esc && esc.t === "escalation") {
      await request(app)
        .post(`/runs/${runId}/decision`)
        .send({ escalationId: esc.escalation.id, choice: "approve_anyway" });
    }
    await awaitEvent(app, runId, ["published"]);
    const res = await request(app)
      .post(`/runs/${runId}/decision`)
      .send({ choice: "approve_anyway" });
    expect(res.status).toBe(409);
  });

  it("should 400 an invalid decision body", async () => {
    const { app, personaId } = buildApp(offVoiceAgent());
    const created = await request(app)
      .post("/runs")
      .send({ personaId, concept: "On Emergence" });
    const res = await request(app)
      .post(`/runs/${created.body.runId}/decision`)
      .send({ choice: "not-a-real-choice" });
    expect(res.status).toBe(400);
  });
});
