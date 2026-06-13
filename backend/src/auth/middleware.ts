import type { Request, Response, NextFunction, RequestHandler } from "express";
import { createJwt, type AuthClaims } from "./jwt.js";

/**
 * Augment Express' Request with the authenticated principal. `requireAuth`
 * populates `req.user`; downstream handlers/middleware read it to scope data by
 * owner (Track A/G ownership) or gate on role (`requireAdmin`).
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthClaims;
    }
  }
}

/** Pull a Bearer token from the Authorization header, or null. Case-insensitive
 * on the scheme; rejects any non-Bearer scheme or a missing/empty token. */
function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  if (!token || token.trim() === "") return null;
  return token.trim();
}

/**
 * Bearer-auth gate (85q.3). Verifies the JWT against `secret`, validates its
 * claims (the jwt module re-validates at this boundary — Rule 2), and stashes
 * the principal on `req.user`. Missing/malformed/expired → structured 401. The
 * secret is injected (not read here) so tests construct the gate without env and
 * so server.ts binds it once to `AUTH_JWT_SECRET`.
 */
export function requireAuth(secret: string): RequestHandler {
  const jwt = createJwt(secret);
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({
        error: { message: "Missing or malformed Authorization header" },
      });
      return;
    }
    try {
      req.user = jwt.verify(token);
    } catch {
      // Don't leak whether it was signature/expiry/claims — uniform 401.
      res.status(401).json({ error: { message: "Invalid or expired token" } });
      return;
    }
    next();
  };
}

/**
 * Admin-only gate (85q.3). MUST run after {@link requireAuth} so `req.user` is
 * present. 401 if unauthenticated (defensive), 403 if authenticated but not an
 * admin.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: { message: "Authentication required" } });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: { message: "Admin privileges required" } });
    return;
  }
  next();
}
