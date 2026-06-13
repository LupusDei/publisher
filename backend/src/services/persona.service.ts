import { z } from "zod";
import {
  NewPersonaSchema,
  PersonaSchema,
  type Persona,
} from "@publisher/shared";
import type { PersonaPatch, PersonaStore } from "../stores/persona.store.js";

/**
 * Raised when input fails contract validation. Routes map this to a structured
 * 400 (Constitution Rule 2 — validate at boundaries; Rule 4 — no HTTP types
 * here so the service stays unit-testable in isolation).
 */
export class PersonaValidationError extends Error {
  constructor(
    message: string,
    /** Field-level issues, shaped for a structured API error body. */
    public readonly issues: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "PersonaValidationError";
  }
}

/** Raised when a persona id does not resolve. Routes map this to a 404. */
export class PersonaNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Persona ${id} not found`);
    this.name = "PersonaNotFoundError";
  }
}

/** A partial edit to a persona, validated before it reaches the store. */
export const PersonaPatchSchema = NewPersonaSchema.partial();

export interface PersonaServiceDeps {
  store: PersonaStore;
}

export interface PersonaService {
  create(input: unknown): Persona;
  getById(id: string): Persona;
  list(): Persona[];
  update(id: string, patch: unknown): Persona;
}

function toIssues(err: z.ZodError): { path: string; message: string }[] {
  return err.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
}

/**
 * Persona service — the business layer between the personas routes and the
 * PersonaStore (Constitution Rule 4). Owns contract validation so the store
 * only ever sees valid shapes and the routes stay thin.
 */
export function createPersonaService(deps: PersonaServiceDeps): PersonaService {
  const { store } = deps;

  return {
    create(input: unknown): Persona {
      const parsed = NewPersonaSchema.safeParse(input);
      if (!parsed.success) {
        throw new PersonaValidationError(
          "Invalid persona",
          toIssues(parsed.error),
        );
      }
      return store.create(parsed.data);
    },

    getById(id: string): Persona {
      const persona = store.getById(id);
      if (!persona) {
        throw new PersonaNotFoundError(id);
      }
      return persona;
    },

    list(): Persona[] {
      return store.list();
    },

    update(id: string, patch: unknown): Persona {
      const parsedPatch = PersonaPatchSchema.safeParse(patch);
      if (!parsedPatch.success) {
        throw new PersonaValidationError(
          "Invalid persona patch",
          toIssues(parsedPatch.error),
        );
      }
      const existing = store.getById(id);
      if (!existing) {
        throw new PersonaNotFoundError(id);
      }
      // Re-validate the merged record so a partial patch can't push the persona
      // out of contract (e.g. clearing the required voiceSample).
      const merged = PersonaSchema.safeParse({
        ...existing,
        ...(parsedPatch.data as PersonaPatch),
        id,
      });
      if (!merged.success) {
        throw new PersonaValidationError(
          "Patch would violate the persona contract",
          toIssues(merged.error),
        );
      }
      const updated = store.update(id, parsedPatch.data as PersonaPatch);
      if (!updated) {
        // Concurrent delete between read and write — surface as not-found.
        throw new PersonaNotFoundError(id);
      }
      return updated;
    },
  };
}
