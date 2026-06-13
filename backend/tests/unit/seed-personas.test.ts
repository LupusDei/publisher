import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb, type DB } from "../../src/stores/db.js";
import { loadMigrations, runMigrations } from "../../src/stores/migrate.js";
import { createPersonaStore } from "../../src/stores/persona.store.js";
import { SEED_PERSONAS, seedPersonas } from "../../scripts/seed-personas.js";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

describe("seedPersonas", () => {
  let db: DB;

  beforeEach(() => {
    db = openDb(":memory:");
    runMigrations(db, loadMigrations(migrationsDir));
  });

  it("should seed two voice-distinct personas with real voiceSamples (happy path)", () => {
    const store = createPersonaStore(db);
    const result = seedPersonas(store);

    expect(result.inserted).toHaveLength(2);
    const all = store.list();
    expect(all).toHaveLength(2);
    // Both have a non-trivial real voice sample.
    for (const p of all) {
      expect(p.voiceSample.length).toBeGreaterThan(40);
      expect(p.voice.length).toBeGreaterThan(0);
    }
    // Voice-distinct: the two voices/samples differ materially.
    expect(all[0]?.voice).not.toBe(all[1]?.voice);
    expect(all[0]?.voiceSample).not.toBe(all[1]?.voiceSample);
  });

  it("should be idempotent — a second run inserts nothing (edge case)", () => {
    const store = createPersonaStore(db);
    seedPersonas(store);
    const second = seedPersonas(store);

    expect(second.inserted).toHaveLength(0);
    expect(second.skipped).toHaveLength(2);
    expect(store.list()).toHaveLength(2);
  });

  it("should expose two personas that declare the fixed design tokens (data check)", () => {
    expect(SEED_PERSONAS).toHaveLength(2);
    for (const p of SEED_PERSONAS) {
      const keys = Object.keys(p.designElements);
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) {
        expect(["palette", "typography", "layout", "tone"]).toContain(k);
      }
    }
  });
});
