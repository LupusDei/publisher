import { Router, type Response } from "express";
import {
  createPersonaService,
  PersonaNotFoundError,
  PersonaValidationError,
} from "../services/persona.service.js";
import type { PersonaStore } from "../stores/persona.store.js";
import { requireAuth } from "../auth/middleware.js";
import type { AuthClaims } from "../auth/jwt.js";

/** Dependencies the personas router needs. The orchestrator wires this with the
 * shared `PersonaStore` (so personas authored here are visible to runs) and the
 * JWT secret used to build the `requireAuth` gate (85q.4). */
export interface PersonasRouterDeps {
  personaStore: PersonaStore;
  jwtSecret: string;
}

/** Per-id ownership outcome: not-found (no such id) vs forbidden (owned by
 * someone else and the viewer is not an admin) vs ok. */
type ScopeResult = "ok" | "not_found" | "forbidden";

/**
 * Decide whether the authed viewer may act on persona `id` (85q.4). Admins see
 * everything; a non-admin may only touch personas they own. Un-owned personas
 * (legacy/seed rows with user_id NULL) stay visible to any authed user so the
 * demo seed data isn't orphaned.
 */
function scopePersona(
  store: PersonaStore,
  id: string,
  viewer: AuthClaims,
): ScopeResult {
  if (!store.getById(id)) return "not_found";
  if (viewer.role === "admin") return "ok";
  const owner = store.ownerOf(id);
  if (owner !== null && owner !== viewer.userId) return "forbidden";
  return "ok";
}

/**
 * Persona routes — thin handlers that delegate to the persona service
 * (Constitution Rule 4: no business logic, no direct data access here). Every
 * route is behind `requireAuth` (85q.4); reads/writes are scoped to the authed
 * owner (admins see all). Errors map to structured HTTP responses.
 *
 * Routes:
 *   POST   /personas       — author a new persona (stamps req.user)
 *   GET    /personas       — list the viewer's personas (admin: all)
 *   GET    /personas/:id   — inspect one persona (owner/admin; 403 on others')
 *   PATCH  /personas/:id   — edit / enrich a persona (owner/admin; D19)
 */
export function personasRouter(deps: PersonasRouterDeps): Router {
  const service = createPersonaService({ store: deps.personaStore });
  const router = Router();

  router.use(requireAuth(deps.jwtSecret));

  router.post("/", (req, res) => {
    try {
      const created = service.create(req.body, req.user!.userId);
      res.status(201).json(created);
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.get("/", (req, res) => {
    // Admins list everything; everyone else only their own personas.
    const ownerId = req.user!.role === "admin" ? undefined : req.user!.userId;
    res.json({ personas: service.list(ownerId) });
  });

  router.get("/:id", (req, res) => {
    const scope = scopePersona(deps.personaStore, req.params.id, req.user!);
    if (!sendScopeError(res, scope)) return;
    try {
      res.json(service.getById(req.params.id));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.patch("/:id", (req, res) => {
    const scope = scopePersona(deps.personaStore, req.params.id, req.user!);
    if (!sendScopeError(res, scope)) return;
    try {
      res.json(service.update(req.params.id, req.body));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  return router;
}

/** Emit a 404/403 for a failed scope check; returns true when the caller may
 * proceed (scope === "ok"). */
function sendScopeError(res: Response, scope: ScopeResult): boolean {
  if (scope === "not_found") {
    res.status(404).json({ error: { message: "Persona not found" } });
    return false;
  }
  if (scope === "forbidden") {
    res.status(403).json({ error: { message: "Not your persona" } });
    return false;
  }
  return true;
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
