import { describe, it, expect, beforeEach } from "vitest";
import {
  createPersonaService,
  PersonaValidationError,
  PersonaNotFoundError,
  type PersonaService,
} from "../../src/services/persona.service.js";
import type {
  PersonaStore,
  PersonaPatch,
} from "../../src/stores/persona.store.js";
import type { Persona, NewPersona } from "@publisher/shared";

/**
 * In-memory fake store with the real data shape (Rule: mock real shapes, not
 * type defs). Behaves like the SQLite store for the service's contract.
 */
function makeFakeStore(): PersonaStore {
  const rows = new Map<string, Persona>();
  let n = 0;
  return {
    create(input: NewPersona): Persona {
      const id = `p_${++n}`;
      const persona: Persona = { id, ...input };
      rows.set(id, persona);
      return persona;
    },
    getById(id: string): Persona | null {
      return rows.get(id) ?? null;
    },
    list(): Persona[] {
      return [...rows.values()];
    },
    update(id: string, patch: PersonaPatch): Persona | null {
      const existing = rows.get(id);
      if (!existing) return null;
      const next: Persona = { ...existing, ...patch, id };
      rows.set(id, next);
      return next;
    },
  };
}

const validInput: NewPersona = {
  name: "The Essayist",
  voice: "Measured, first-person, fond of the em-dash.",
  voiceSample: "Emergence is not magic — only attention paid closely enough.",
  stylePoints: ["short paragraphs"],
  keyLearnings: ["emergence is not magic"],
  designElements: { palette: "warm neutrals", typography: "serif" },
};

describe("PersonaService", () => {
  let service: PersonaService;

  beforeEach(() => {
    service = createPersonaService({ store: makeFakeStore() });
  });

  // ── create ────────────────────────────────────────────────────────────
  describe("create", () => {
    it("should create a persona from valid input (happy path)", () => {
      const created = service.create(validInput);
      expect(created.id).toMatch(/^p_/);
      expect(created.name).toBe(validInput.name);
      expect(created.voiceSample).toBe(validInput.voiceSample);
    });

    it("should throw PersonaValidationError when a required field is missing (error path)", () => {
      const bad = { ...validInput, voiceSample: "" };
      expect(() => service.create(bad)).toThrow(PersonaValidationError);
    });

    it("should reject an unknown extra design-token-less name (edge case: empty name)", () => {
      expect(() => service.create({ ...validInput, name: "" })).toThrow(
        PersonaValidationError,
      );
    });
  });

  // ── getById ───────────────────────────────────────────────────────────
  describe("getById", () => {
    it("should return the persona for a known id (happy path)", () => {
      const created = service.create(validInput);
      expect(service.getById(created.id)).toEqual(created);
    });

    it("should throw PersonaNotFoundError for an unknown id (error path)", () => {
      expect(() => service.getById("nope")).toThrow(PersonaNotFoundError);
    });

    it("should throw for an empty id (edge case)", () => {
      expect(() => service.getById("")).toThrow(PersonaNotFoundError);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────
  describe("list", () => {
    it("should return all created personas (happy path)", () => {
      service.create(validInput);
      service.create({ ...validInput, name: "Second" });
      expect(service.list()).toHaveLength(2);
    });

    it("should return an empty array when none exist (edge case)", () => {
      expect(service.list()).toEqual([]);
    });

    it("should preserve created field values across the list (happy path 2)", () => {
      service.create(validInput);
      const [only] = service.list();
      expect(only?.designElements).toEqual(validInput.designElements);
    });
  });

  // ── update ────────────────────────────────────────────────────────────
  describe("update", () => {
    it("should apply a valid partial patch (happy path)", () => {
      const created = service.create(validInput);
      const updated = service.update(created.id, { voice: "Sharper." });
      expect(updated.voice).toBe("Sharper.");
      expect(updated.name).toBe(validInput.name);
    });

    it("should throw PersonaNotFoundError when updating an unknown id (error path)", () => {
      expect(() => service.update("nope", { voice: "x" })).toThrow(
        PersonaNotFoundError,
      );
    });

    it("should throw PersonaValidationError when a patch violates the contract (edge case)", () => {
      const created = service.create(validInput);
      expect(() => service.update(created.id, { voiceSample: "" })).toThrow(
        PersonaValidationError,
      );
    });
  });
});
