import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createUserStore } from "../../src/stores/user.store.js";
import { createJwt } from "../../src/auth/jwt.js";
import { createAuthService } from "../../src/services/auth.service.js";
import { authRouter } from "../../src/routes/auth.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const SECRET = "auth-routes-test-secret";
const creds = { email: "writer@example.com", password: "correct horse" };

function makeApp(): Express {
  const db: DB = openDb(":memory:");
  runMigrations(db, loadMigrations(migrationsDir));
  const userStore = createUserStore(db);
  const jwt = createJwt(SECRET);
  const auth = createAuthService({ userStore, jwt });
  return createApp({
    corsOrigin: "*",
    version: "test",
    routers: [
      { path: "/auth", router: authRouter({ auth, jwtSecret: SECRET }) },
    ],
  });
}

describe("auth routes — POST /auth/register", () => {
  let app: Express;
  beforeEach(() => {
    app = makeApp();
  });

  it("should register a new user and return 201 with {token, user}", async () => {
    const res = await request(app).post("/auth/register").send(creds);
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.email).toBe(creds.email);
    expect(res.body.user.role).toBe("user");
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("should return 409 when the email is already registered (error path)", async () => {
    await request(app).post("/auth/register").send(creds);
    const res = await request(app).post("/auth/register").send(creds);
    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
  });

  it("should return 400 for malformed input (bad email / empty password)", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "not-an-email", password: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe("auth routes — POST /auth/login", () => {
  let app: Express;
  beforeEach(async () => {
    app = makeApp();
    await request(app).post("/auth/register").send(creds);
  });

  it("should return 200 with {token, user} for valid credentials", async () => {
    const res = await request(app).post("/auth/login").send(creds);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.email).toBe(creds.email);
  });

  it("should return 401 for an invalid password (error path)", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ ...creds, password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it("should return 401 for an unknown email (no enumeration)", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ghost@example.com", password: "whatever" });
    expect(res.status).toBe(401);
  });
});

describe("auth routes — GET /auth/me", () => {
  let app: Express;
  let token: string;
  beforeEach(async () => {
    app = makeApp();
    const reg = await request(app).post("/auth/register").send(creds);
    token = reg.body.token as string;
  });

  it("should return the current user for a valid Bearer token", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(creds.email);
  });

  it("should return 401 without a token (error path)", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("auth routes — POST /auth/logout", () => {
  it("should return 200 (stateless — client clears the token)", async () => {
    const app = makeApp();
    const res = await request(app).post("/auth/logout");
    expect(res.status).toBe(200);
  });
});
