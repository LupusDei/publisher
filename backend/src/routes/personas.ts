import { Router, type Response } from "express";
import {
  createPersonaService,
  PersonaNotFoundError,
  PersonaValidationError,
} from "../services/persona.service.js";
import type { PersonaStore } from "../stores/persona.store.js";

/** Dependencies the personas router needs. The orchestrator wires this with the
 * shared `PersonaStore` (so personas authored here are visible to runs). */
export interface PersonasRouterDeps {
  personaStore: PersonaStore;
}

/**
 * Persona routes — thin handlers that delegate to the persona service
 * (Constitution Rule 4: no business logic, no direct data access here). Errors
 * from the service are mapped to structured HTTP responses.
 *
 * Routes:
 *   POST   /personas       — author a new persona
 *   GET    /personas       — list all personas (gallery)
 *   GET    /personas/:id   — inspect one persona (detail)
 *   PATCH  /personas/:id   — edit / enrich a persona (D19)
 */
export function personasRouter(deps: PersonasRouterDeps): Router {
  const service = createPersonaService({ store: deps.personaStore });
  const router = Router();

  router.post("/", (req, res) => {
    try {
      const created = service.create(req.body);
      res.status(201).json(created);
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.get("/", (_req, res) => {
    res.json({ personas: service.list() });
  });

  router.get("/:id", (req, res) => {
    try {
      res.json(service.getById(req.params.id));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.patch("/:id", (req, res) => {
    try {
      res.json(service.update(req.params.id, req.body));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  return router;
}

/** Maps service errors to structured HTTP responses (single error vocabulary). */
function sendError(res: Response, err: unknown): void {
  if (err instanceof PersonaValidationError) {
    res.status(400).json({
      error: { message: err.message, issues: err.issues },
    });
    return;
  }
  if (err instanceof PersonaNotFoundError) {
    res.status(404).json({ error: { message: err.message } });
    return;
  }
  res.status(500).json({
    error: { message: err instanceof Error ? err.message : "Unexpected error" },
  });
}
