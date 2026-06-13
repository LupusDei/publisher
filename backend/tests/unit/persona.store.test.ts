import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createPersonaStore } from "../../src/stores/persona.store.js";
import type { NewPersona } from "@publisher/shared";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const sample: NewPersona = {
  name: "The Essayist",
  voice: "Measured, first-person, fond of the em-dash.",
  stylePoints: ["short paragraphs", "one image per section"],
  keyLearnings: ["emergence is not magic"],
  designElements: { palette: "warm neutrals", typography: "serif" },
};

describe("PersonaStore", () => {
  let db: DB;

  beforeEach(() => {
    db = openDb(":memory:");
    // Exercise the real migration file, not an inline copy.
    runMigrations(db, loadMigrations(migrationsDir));
  });

  it("should create a persona, assign an id, and round-trip arrays/objects", () => {
    let counter = 0;
    const store = createPersonaStore(
      db,
      () => `p_${++counter}`,
      () => "2026-06-13T00:00:00.000Z",
    );
    const created = store.create(sample);
    expect(created.id).toBe("p_1");
    expect(created.name).toBe(sample.name);
    expect(created.stylePoints).toEqual(sample.stylePoints);
    expect(created.designElements).toEqual(sample.designElements);

    const fetched = store.getById("p_1");
    expect(fetched).toEqual(created);
  });

  it("should return null for an unknown id", () => {
    const store = createPersonaStore(db);
    expect(store.getById("does-not-exist")).toBeNull();
  });

  it("should return an empty array when no personas exist (edge case)", () => {
    const store = createPersonaStore(db);
    expect(store.list()).toEqual([]);
  });

  it("should list personas in creation order", () => {
    let n = 0;
    const times = ["2026-06-13T00:00:01.000Z", "2026-06-13T00:00:02.000Z"];
    const store = createPersonaStore(
      db,
      () => `p_${n + 1}`,
      () => times[n++] ?? "2026-06-13T00:00:09.000Z",
    );
    store.create({ ...sample, name: "First" });
    store.create({ ...sample, name: "Second" });
    const all = store.list();
    expect(all.map((p) => p.name)).toEqual(["First", "Second"]);
  });
});
