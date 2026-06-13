import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createUserStore } from "../../src/stores/user.store.js";
import { verify } from "../../src/auth/password.js";
import { seedAdmin } from "../../scripts/seed-admin.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const creds = { email: "admin@example.com", password: "super-secret-admin" };

describe("seedAdmin", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
  });

  it("should create an admin user with the admin role (happy path)", async () => {
    const store = createUserStore(db);
    const result = await seedAdmin(store, creds);

    expect(result.created).toBe(true);
    expect(result.user.email).toBe(creds.email);
    expect(result.user.role).toBe("admin");
  });

  it("should store a bcrypt hash, not the plaintext (security check)", async () => {
    const store = createUserStore(db);
    await seedAdmin(store, creds);
    const record = store.getByEmail(creds.email);
    expect(record).not.toBeNull();
    expect(record?.passwordHash).not.toBe(creds.password);
    expect(await verify(creds.password, record!.passwordHash)).toBe(true);
  });

  it("should be idempotent — a second run creates nothing (edge case)", async () => {
    const store = createUserStore(db);
    await seedAdmin(store, creds);
    const second = await seedAdmin(store, creds);
    expect(second.created).toBe(false);
    expect(second.user.email).toBe(creds.email);
  });

  it("should reject malformed credentials (error path)", async () => {
    const store = createUserStore(db);
    await expect(
      seedAdmin(store, { email: "not-an-email", password: "" }),
    ).rejects.toThrow();
  });
});
