import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createPersonaStore } from "../../src/stores/persona.store.js";
import { createRunStore } from "../../src/stores/run.store.js";
import type { NewPersona } from "@publisher/shared";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const sample: NewPersona = {
  name: "The Essayist",
  voice: "Measured, first-person.",
  voiceSample: "Emergence is not magic — only attention paid closely enough.",
  stylePoints: ["short paragraphs"],
  keyLearnings: ["emergence is not magic"],
  designElements: { palette: "warm neutrals", typography: "serif" },
};

describe("PersonaStore ownership", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
  });

  it("should stamp the owner on create and expose it via ownerOf", () => {
    const store = createPersonaStore(db);
    const p = store.create(sample, "u_alice");
    expect(store.ownerOf(p.id)).toBe("u_alice");
  });

  it("should default ownerId to null when none is supplied (edge case)", () => {
    const store = createPersonaStore(db);
    const p = store.create(sample);
    expect(store.ownerOf(p.id)).toBeNull();
  });

  it("should list only an owner's personas, and all for no filter", () => {
    const store = createPersonaStore(db);
    store.create({ ...sample, name: "A" }, "u_alice");
    store.create({ ...sample, name: "B" }, "u_bob");
    expect(store.list("u_alice").map((p) => p.name)).toEqual(["A"]);
    expect(
      store
        .list()
        .map((p) => p.name)
        .sort(),
    ).toEqual(["A", "B"]);
  });

  it("should return null ownerOf for an unknown id", () => {
    const store = createPersonaStore(db);
    expect(store.ownerOf("nope")).toBeNull();
  });
});

describe("RunStore ownership", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
  });

  it("should stamp the owner on create and expose it via ownerOf", () => {
    const store = createRunStore(db);
    store.create({
      id: "run_1",
      personaId: "p",
      concept: "c",
      workerId: "mock",
      userId: "u_alice",
    });
    expect(store.ownerOf("run_1")).toBe("u_alice");
  });

  it("should default ownerId to null when none is supplied (edge case)", () => {
    const store = createRunStore(db);
    store.create({
      id: "run_2",
      personaId: "p",
      concept: "c",
      workerId: "mock",
    });
    expect(store.ownerOf("run_2")).toBeNull();
  });

  it("should list only an owner's runs, and all for no filter", () => {
    const store = createRunStore(db);
    store.create({
      id: "run_a",
      personaId: "p",
      concept: "c",
      workerId: "mock",
      userId: "u_alice",
    });
    store.create({
      id: "run_b",
      personaId: "p",
      concept: "c",
      workerId: "mock",
      userId: "u_bob",
    });
    expect(store.list("u_alice").map((r) => r.id)).toEqual(["run_a"]);
    expect(
      store
        .list()
        .map((r) => r.id)
        .sort(),
    ).toEqual(["run_a", "run_b"]);
  });
});
