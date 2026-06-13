import { describe, it, expect } from "vitest";
import { openDb } from "../../src/stores/db.js";
import { runMigrations, type Migration } from "../../src/stores/migrate.js";

const M1: Migration = {
  name: "0001_a.sql",
  sql: "CREATE TABLE a (id INTEGER);",
};
const M2: Migration = {
  name: "0002_b.sql",
  sql: "CREATE TABLE b (id INTEGER);",
};

describe("runMigrations", () => {
  it("should apply all pending migrations in order", () => {
    const db = openDb(":memory:");
    const applied = runMigrations(db, [M1, M2]);
    expect(applied).toEqual(["0001_a.sql", "0002_b.sql"]);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain("a");
    expect(names).toContain("b");
  });

  it("should skip migrations that were already applied (idempotent)", () => {
    const db = openDb(":memory:");
    runMigrations(db, [M1]);
    const second = runMigrations(db, [M1, M2]);
    expect(second).toEqual(["0002_b.sql"]); // only the new one
    const third = runMigrations(db, [M1, M2]);
    expect(third).toEqual([]); // nothing left to do
  });

  it("should surface an error and not record a failing migration", () => {
    const db = openDb(":memory:");
    const bad: Migration = {
      name: "0001_bad.sql",
      sql: "CREATE TABLE (bad sql;",
    };
    expect(() => runMigrations(db, [bad])).toThrow();
    const recorded = db.prepare(`SELECT name FROM _migrations`).all() as Array<{
      name: string;
    }>;
    expect(recorded).toEqual([]); // rolled back, not marked applied
  });
});
