import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createPersonaStore } from "../../src/stores/persona.store.js";
import { personasRouter } from "../../src/routes/personas.js";
import type { NewPersona } from "@publisher/shared";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const validBody: NewPersona = {
  name: "The Essayist",
  voice: "Measured, first-person, fond of the em-dash.",
  voiceSample: "Emergence is not magic — only attention paid closely enough.",
  stylePoints: ["short paragraphs"],
  keyLearnings: ["emergence is not magic"],
  designElements: { palette: "warm neutrals", typography: "serif" },
};

describe("personas routes", () => {
  let app: Express;
  let db: DB;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
    const personaStore = createPersonaStore(db);
    app = createApp({
      corsOrigin: "*",
      version: "test",
      routers: [
        { path: "/personas", router: personasRouter({ personaStore }) },
      ],
    });
  });

  // ── POST /personas ──────────────────────────────────────────────────────
  it("POST /personas should create a persona and return 201 with the record", async () => {
    const res = await request(app).post("/personas").send(validBody);
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe("string");
    expect(res.body.name).toBe(validBody.name);
    expect(res.body.voiceSample).toBe(validBody.voiceSample);
  });

  it("POST /personas should return a structured 400 for invalid input", async () => {
    const res = await request(app)
      .post("/personas")
      .send({ ...validBody, voiceSample: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(Array.isArray(res.body.error.issues)).toBe(true);
  });

  // ── GET /personas ─────────────────────────────────────────────────────────
  it("GET /personas should return the list of personas", async () => {
    await request(app).post("/personas").send(validBody);
    const res = await request(app).get("/personas");
    expect(res.status).toBe(200);
    expect(res.body.personas).toHaveLength(1);
    expect(res.body.personas[0].name).toBe(validBody.name);
  });

  it("GET /personas should return an empty list when none exist", async () => {
    const res = await request(app).get("/personas");
    expect(res.status).toBe(200);
    expect(res.body.personas).toEqual([]);
  });

  // ── GET /personas/:id ──────────────────────────────────────────────────────
  it("GET /personas/:id should return the persona for a known id", async () => {
    const created = await request(app).post("/personas").send(validBody);
    const res = await request(app).get(`/personas/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("GET /personas/:id should return a structured 404 for an unknown id", async () => {
    const res = await request(app).get("/personas/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  // ── PATCH /personas/:id ────────────────────────────────────────────────────
  it("PATCH /personas/:id should apply a patch and return the updated persona", async () => {
    const created = await request(app).post("/personas").send(validBody);
    const res = await request(app)
      .patch(`/personas/${created.body.id}`)
      .send({ voice: "Sharper, more direct." });
    expect(res.status).toBe(200);
    expect(res.body.voice).toBe("Sharper, more direct.");
    expect(res.body.name).toBe(validBody.name);
  });

  it("PATCH /personas/:id should return a structured 404 for an unknown id", async () => {
    const res = await request(app).patch("/personas/nope").send({ voice: "x" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it("PATCH /personas/:id should return a structured 400 when the patch breaks the contract", async () => {
    const created = await request(app).post("/personas").send(validBody);
    const res = await request(app)
      .patch(`/personas/${created.body.id}`)
      .send({ voiceSample: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
