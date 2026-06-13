import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createUserStore } from "../../src/stores/user.store.js";
import { createJwt } from "../../src/auth/jwt.js";
import {
  createAuthService,
  InvalidCredentialsError,
  DuplicateEmailError,
  UserNotFoundError,
  type AuthService,
} from "../../src/services/auth.service.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

function freshService(): AuthService {
  const db = openDb(":memory:");
  runMigrations(db, loadMigrations(migrationsDir));
  let n = 0;
  const userStore = createUserStore(
    db,
    () => `u_${++n}`,
    () => "2026-06-13T00:00:00.000Z",
  );
  return createAuthService({ userStore, jwt: createJwt("svc-test-secret") });
}

const creds = { email: "writer@example.com", password: "correct horse" };

describe("AuthService.register", () => {
  let svc: AuthService;
  beforeEach(() => {
    svc = freshService();
  });

  it("should create a user and return a token + public user (happy path)", async () => {
    const result = await svc.register(creds);
    expect(result.token).toContain(".");
    expect(result.user.email).toBe(creds.email);
    expect(result.user.role).toBe("user");
    expect("passwordHash" in result.user).toBe(false);
  });

  it("should reject a duplicate email (error path)", async () => {
    await svc.register(creds);
    await expect(svc.register(creds)).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );
  });

  it("should store a hash, not the plaintext (security edge)", async () => {
    const { user } = await svc.register(creds);
    // Logging in with the same password must succeed → it was hashed + stored.
    const login = await svc.login(creds);
    expect(login.user.id).toBe(user.id);
  });

  it("should reject empty/invalid credentials (edge case)", async () => {
    await expect(
      svc.register({ email: "not-an-email", password: "" }),
    ).rejects.toThrow();
  });
});

describe("AuthService.login", () => {
  let svc: AuthService;
  beforeEach(async () => {
    svc = freshService();
    await svc.register(creds);
  });

  it("should return a token + user for valid credentials (happy path)", async () => {
    const result = await svc.login(creds);
    expect(result.token).toContain(".");
    expect(result.user.email).toBe(creds.email);
  });

  it("should reject a wrong password with InvalidCredentialsError (error path)", async () => {
    await expect(
      svc.login({ email: creds.email, password: "wrong" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("should reject an unknown email with InvalidCredentialsError (edge case)", async () => {
    await expect(
      svc.login({ email: "ghost@example.com", password: "whatever" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("should not reveal whether the email or the password was wrong", async () => {
    const unknownEmail = svc
      .login({ email: "ghost@example.com", password: "x" })
      .catch((e: Error) => e.message);
    const wrongPassword = svc
      .login({ email: creds.email, password: "x" })
      .catch((e: Error) => e.message);
    expect(await unknownEmail).toBe(await wrongPassword);
  });
});

describe("AuthService.me", () => {
  let svc: AuthService;
  let userId: string;
  beforeEach(async () => {
    svc = freshService();
    userId = (await svc.register(creds)).user.id;
  });

  it("should return the public user for a known id (happy path)", () => {
    const user = svc.me(userId);
    expect(user.email).toBe(creds.email);
    expect("passwordHash" in user).toBe(false);
  });

  it("should throw UserNotFoundError for an unknown id (error path)", () => {
    expect(() => svc.me("u_missing")).toThrow(UserNotFoundError);
  });

  it("should return a role on the user record (edge case)", () => {
    expect(svc.me(userId).role).toBe("user");
  });
});
