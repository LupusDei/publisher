import { Router, type Response } from "express";
import { ZodError } from "zod";
import {
  type AuthService,
  DuplicateEmailError,
  InvalidCredentialsError,
  UserNotFoundError,
} from "../services/auth.service.js";
import { requireAuth } from "../auth/middleware.js";

/** Dependencies the auth router needs: the auth service + the JWT secret used to
 * build the `requireAuth` gate for `GET /auth/me`. */
export interface AuthRouterDeps {
  auth: AuthService;
  jwtSecret: string;
}

/**
 * Auth routes (85q.3) — thin handlers over the auth service (Constitution Rule
 * 4). Errors from the service are mapped to a single structured HTTP vocabulary.
 *
 * Routes:
 *   POST /auth/register  — create an account → 201 {token, user}
 *   POST /auth/login     — exchange credentials → 200 {token, user}
 *   POST /auth/logout    — stateless no-op → 200 (client discards the token)
 *   GET  /auth/me        — the current user (requireAuth) → 200 User
 */
export function authRouter(deps: AuthRouterDeps): Router {
  const { auth, jwtSecret } = deps;
  const router = Router();

  router.post("/register", (req, res) => {
    auth
      .register(req.body)
      .then((result) => res.status(201).json(result))
      .catch((err: unknown) => sendError(res, err));
  });

  router.post("/login", (req, res) => {
    auth
      .login(req.body)
      .then((result) => res.status(200).json(result))
      .catch((err: unknown) => sendError(res, err));
  });

  // Stateless logout (spec): no server-side session/revocation for the MVP, so
  // the server simply acknowledges and the client clears its stored token.
  router.post("/logout", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  router.get("/me", requireAuth(jwtSecret), (req, res) => {
    try {
      // requireAuth guarantees req.user; `!` is safe behind that gate.
      res.json(auth.me(req.user!.userId));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  return router;
}

/** Maps auth service / validation errors to structured HTTP responses. */
function sendError(res: Response, err: unknown): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: "Invalid credentials payload",
        issues: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    });
    return;
  }
  if (err instanceof DuplicateEmailError) {
    res.status(409).json({ error: { message: err.message } });
    return;
  }
  if (err instanceof InvalidCredentialsError) {
    res.status(401).json({ error: { message: err.message } });
    return;
  }
  if (err instanceof UserNotFoundError) {
    res.status(404).json({ error: { message: err.message } });
    return;
  }
  res.status(500).json({
    error: { message: err instanceof Error ? err.message : "Unexpected error" },
  });
}
