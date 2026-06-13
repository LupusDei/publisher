import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import {
  createUserStore,
  DuplicateEmailError,
  type UserStore,
} from "../../src/stores/user.store.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

function freshStore(): { db: DB; store: UserStore } {
  const db = openDb(":memory:");
  runMigrations(db, loadMigrations(migrationsDir));
  let n = 0;
  const store = createUserStore(
    db,
    () => `u_${++n}`,
    () => "2026-06-13T00:00:00.000Z",
  );
  return { db, store };
}

describe("UserStore", () => {
  let store: UserStore;

  beforeEach(() => {
    ({ store } = freshStore());
  });

  it("should create a user, assign an id, and default role to 'user' when omitted (happy path)", () => {
    const user = store.create({
      email: "writer@example.com",
      passwordHash: "$2a$10$hash",
    });
    expect(user.id).toBe("u_1");
    expect(user.email).toBe("writer@example.com");
    expect(user.role).toBe("user");
    expect(user.createdAt).toBe("2026-06-13T00:00:00.000Z");
    // The public record must never leak the hash.
    expect("passwordHash" in user).toBe(false);
  });

  it("should persist an explicit admin role", () => {
    const user = store.create({
      email: "boss@example.com",
      passwordHash: "$2a$10$hash",
      role: "admin",
    });
    expect(user.role).toBe("admin");
  });

  it("should reject a duplicate email with DuplicateEmailError (error path)", () => {
    store.create({ email: "dup@example.com", passwordHash: "$2a$10$a" });
    expect(() =>
      store.create({ email: "dup@example.com", passwordHash: "$2a$10$b" }),
    ).toThrow(DuplicateEmailError);
  });

  it("should fetch by email including the password hash for verification (happy path)", () => {
    store.create({ email: "writer@example.com", passwordHash: "$2a$10$hash" });
    const record = store.getByEmail("writer@example.com");
    expect(record).not.toBeNull();
    expect(record?.passwordHash).toBe("$2a$10$hash");
    expect(record?.user.email).toBe("writer@example.com");
  });

  it("should return null from getByEmail for an unknown email (edge case)", () => {
    expect(store.getByEmail("nobody@example.com")).toBeNull();
  });

  it("should fetch the public user by id (happy path)", () => {
    const created = store.create({
      email: "writer@example.com",
      passwordHash: "$2a$10$hash",
    });
    const fetched = store.getById(created.id);
    expect(fetched).toEqual(created);
    expect(fetched && "passwordHash" in fetched).toBe(false);
  });

  it("should return null from getById for an unknown id (edge case)", () => {
    expect(store.getById("u_does_not_exist")).toBeNull();
  });

  it("should update a stored password hash via setPassword (happy path)", () => {
    const created = store.create({
      email: "writer@example.com",
      passwordHash: "$2a$10$old",
    });
    store.setPassword(created.id, "$2a$10$new");
    expect(store.getByEmail("writer@example.com")?.passwordHash).toBe(
      "$2a$10$new",
    );
  });

  it("should return false from setPassword for an unknown id (edge case)", () => {
    expect(store.setPassword("u_missing", "$2a$10$new")).toBe(false);
  });
});
