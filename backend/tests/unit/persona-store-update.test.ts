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
  voiceSample: "Emergence is not magic — only attention paid closely enough.",
  stylePoints: ["short paragraphs"],
  keyLearnings: ["emergence is not magic"],
  designElements: { palette: "warm neutrals" },
};

describe("PersonaStore.update (D19 — edit/enrich)", () => {
  let db: DB;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
  });

  it("should apply a partial patch and persist it (happy path)", () => {
    const store = createPersonaStore(db, () => "p_1");
    store.create(sample);

    const updated = store.update("p_1", {
      voice: "Sharper, more direct.",
      stylePoints: ["bullet lists"],
    });

    expect(updated).not.toBeNull();
    expect(updated?.voice).toBe("Sharper, more direct.");
    expect(updated?.stylePoints).toEqual(["bullet lists"]);
    // Untouched fields are preserved.
    expect(updated?.name).toBe(sample.name);
    expect(updated?.voiceSample).toBe(sample.voiceSample);
    // Re-reading returns the persisted patch.
    expect(store.getById("p_1")).toEqual(updated);
  });

  it("should return null when updating an unknown id (error path)", () => {
    const store = createPersonaStore(db);
    expect(store.update("nope", { voice: "x" })).toBeNull();
  });

  it("should be a no-op-safe round-trip for an empty patch (edge case)", () => {
    const store = createPersonaStore(db, () => "p_1");
    const created = store.create(sample);
    const updated = store.update("p_1", {});
    expect(updated).toEqual(created);
  });

  it("should replace array and object fields wholesale, not merge them (edge case)", () => {
    const store = createPersonaStore(db, () => "p_1");
    store.create(sample);
    const updated = store.update("p_1", {
      designElements: { typography: "serif" },
      keyLearnings: [],
    });
    expect(updated?.designElements).toEqual({ typography: "serif" });
    expect(updated?.keyLearnings).toEqual([]);
  });
});
