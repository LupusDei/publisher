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
import { createJwt } from "../../src/auth/jwt.js";
import type { NewPersona } from "@publisher/shared";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const SECRET = "ownership-routes-secret";
const jwt = createJwt(SECRET);
const alice = `Bearer ${jwt.sign({ userId: "u_alice", role: "user" })}`;
const bob = `Bearer ${jwt.sign({ userId: "u_bob", role: "user" })}`;
const admin = `Bearer ${jwt.sign({ userId: "u_admin", role: "admin" })}`;

const body: NewPersona = {
  name: "The Essayist",
  voice: "Measured, first-person.",
  voiceSample: "Emergence is not magic — only attention paid closely enough.",
  stylePoints: ["short paragraphs"],
  keyLearnings: ["emergence is not magic"],
  designElements: { palette: "warm neutrals", typography: "serif" },
};

describe("persona routes — ownership scoping", () => {
  let app: Express;
  beforeEach(() => {
    const db: DB = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
    const personaStore = createPersonaStore(db);
    app = createApp({
      corsOrigin: "*",
      version: "test",
      routers: [
        {
          path: "/personas",
          router: personasRouter({ personaStore, jwtSecret: SECRET }),
        },
      ],
    });
  });

  it("should 401 without a Bearer token", async () => {
    const res = await request(app).get("/personas");
    expect(res.status).toBe(401);
  });

  it("should stamp the creator and scope the list to the owner", async () => {
    await request(app).post("/personas").set("Authorization", alice).send(body);
    await request(app)
      .post("/personas")
      .set("Authorization", bob)
      .send({ ...body, name: "Bob's" });

    const aliceList = await request(app)
      .get("/personas")
      .set("Authorization", alice);
    expect(aliceList.body.personas).toHaveLength(1);
    expect(aliceList.body.personas[0].name).toBe(body.name);
  });

  it("should let an admin see all personas", async () => {
    await request(app).post("/personas").set("Authorization", alice).send(body);
    await request(app)
      .post("/personas")
      .set("Authorization", bob)
      .send({ ...body, name: "Bob's" });
    const all = await request(app).get("/personas").set("Authorization", admin);
    expect(all.body.personas).toHaveLength(2);
  });

  it("should 403 when reading another user's persona by id", async () => {
    const created = await request(app)
      .post("/personas")
      .set("Authorization", alice)
      .send(body);
    const res = await request(app)
      .get(`/personas/${created.body.id}`)
      .set("Authorization", bob);
    expect(res.status).toBe(403);
  });

  it("should let the owner GET their own persona by id", async () => {
    const created = await request(app)
      .post("/personas")
      .set("Authorization", alice)
      .send(body);
    const res = await request(app)
      .get(`/personas/${created.body.id}`)
      .set("Authorization", alice);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("should let an admin GET any persona by id", async () => {
    const created = await request(app)
      .post("/personas")
      .set("Authorization", alice)
      .send(body);
    const res = await request(app)
      .get(`/personas/${created.body.id}`)
      .set("Authorization", admin);
    expect(res.status).toBe(200);
  });

  it("should 404 (not 403) for a genuinely unknown id", async () => {
    const res = await request(app)
      .get("/personas/does-not-exist")
      .set("Authorization", alice);
    expect(res.status).toBe(404);
  });

  it("should 403 when PATCHing another user's persona", async () => {
    const created = await request(app)
      .post("/personas")
      .set("Authorization", alice)
      .send(body);
    const res = await request(app)
      .patch(`/personas/${created.body.id}`)
      .set("Authorization", bob)
      .send({ voice: "hijacked" });
    expect(res.status).toBe(403);
  });
});
