import { describe, it, expect } from "vitest";
import { createSource } from "../../src/material/source.js";
import type { PersonaStore } from "../../src/stores/persona.store.js";
import type { NewPersona, Persona } from "@publisher/shared";

const persona: Persona = {
  id: "p_1",
  name: "The Essayist",
  voice: "Measured, first-person, fond of the em-dash.",
  voiceSample: "Emergence is not magic — only attention paid closely enough.",
  stylePoints: ["short paragraphs"],
  keyLearnings: ["emergence is not magic"],
  designElements: { palette: "warm neutrals" },
};

/** A minimal in-memory PersonaStore stub — Source depends on the interface,
 * not the SQLite implementation (Constitution Rule 4). */
function stubStore(byId: Record<string, Persona>): PersonaStore {
  return {
    create(_input: NewPersona): Persona {
      throw new Error("not used in these tests");
    },
    getById(id: string): Persona | null {
      return byId[id] ?? null;
    },
    list(): Persona[] {
      return Object.values(byId);
    },
  };
}

describe("Source", () => {
  it("should assemble Material from a valid concept and persona", async () => {
    const source = createSource(stubStore({ p_1: persona }));

    const { material, alarms } = await source.load(
      "The quiet power of emergence",
      "p_1",
    );

    expect(alarms).toEqual([]);
    expect(material).toEqual({
      concept: "The quiet power of emergence",
      persona,
    });
  });

  it("should trim surrounding whitespace from the concept", async () => {
    const source = createSource(stubStore({ p_1: persona }));

    const { material, alarms } = await source.load("   spaced out   ", "p_1");

    expect(alarms).toEqual([]);
    expect(material?.concept).toBe("spaced out");
  });

  it("should return an INPUT_EMPTY warning and NO material for an empty concept (D7)", async () => {
    const source = createSource(stubStore({ p_1: persona }));

    const { material, alarms } = await source.load("   ", "p_1");

    expect(material).toBeUndefined();
    expect(alarms).toHaveLength(1);
    expect(alarms[0].type).toBe("INPUT_EMPTY");
    expect(alarms[0].severity).toBe("warning");
    expect(alarms[0].recommendedAction).toMatch(/concept/i);
  });

  it("should treat a too-thin concept as empty input", async () => {
    const source = createSource(stubStore({ p_1: persona }));

    const { material, alarms } = await source.load("a", "p_1");

    expect(material).toBeUndefined();
    expect(alarms[0].type).toBe("INPUT_EMPTY");
  });

  it("should return an INPUT_EMPTY warning when the persona is missing", async () => {
    const source = createSource(stubStore({}));

    const { material, alarms } = await source.load(
      "a perfectly good concept",
      "missing",
    );

    expect(material).toBeUndefined();
    expect(alarms).toHaveLength(1);
    expect(alarms[0].type).toBe("INPUT_EMPTY");
    expect(alarms[0].severity).toBe("warning");
    expect(alarms[0].context.personaId).toBe("missing");
  });

  it("should never throw — alarms are returned, not thrown (D7)", async () => {
    const source = createSource(stubStore({}));

    await expect(source.load("", "")).resolves.toBeDefined();
  });
});
