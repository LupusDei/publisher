import { Router } from "express";
import type { Persona } from "@publisher/shared";
import { createGuardrailEngine } from "../guardrails/index.js";

/**
 * Read-only persona lookup the compiled-guardrail route depends on. Declared
 * structurally (just `getById`) so the route is decoupled from the SQLite
 * PersonaStore — the real store and test stubs both satisfy it (Constitution
 * Rule 4: depend on the interface, not the implementation).
 */
export interface PersonaLookup {
  getById(id: string): Persona | null;
}

export interface GuardrailRouteDeps {
  personaStore: PersonaLookup;
}

/**
 * Guardrails route (Pillar 2 inspection surface). `GET /personas/:id/compiled`
 * returns the compiled guardrail for a stored persona — `{ systemPrompt,
 * validators: [{ rule, ... }] }` — powering the R3 compiled-guardrail panel.
 * Validators are DESCRIBED as data, never serialized as functions. Thin handler
 * that delegates to the GuardrailEngine (Rule 4) and validates the boundary
 * (Rule 2).
 */
export function guardrailsRouter(deps: GuardrailRouteDeps): Router {
  const engine = createGuardrailEngine();
  const router = Router();

  router.get("/:id/compiled", (req, res) => {
    const persona = deps.personaStore.getById(req.params.id);
    if (!persona) {
      res.status(404).json({
        error: { message: `Persona ${req.params.id} not found` },
      });
      return;
    }
    res.json(engine.describe(persona));
  });

  return router;
}
