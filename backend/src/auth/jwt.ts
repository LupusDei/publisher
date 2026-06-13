import jwt from "jsonwebtoken";
import { z } from "zod";
import { RoleSchema, type Role } from "@publisher/shared";

/** The claims we sign into the bearer token. Kept minimal and stateless
 * (Locked decision: no server-side revocation list for the MVP). */
export interface AuthClaims {
  userId: string;
  role: Role;
}

/** Validated shape of a decoded payload. `jsonwebtoken` returns `string |
 * object`; we re-validate at this boundary (Constitution Rule 2) so a token
 * missing/`malforming` a claim is rejected rather than trusted. */
const ClaimsSchema = z.object({
  userId: z.string().min(1),
  role: RoleSchema,
});

/** Token lifetime. Short-lived + re-login is the chosen revocation story. */
const EXPIRES_IN = "12h";
const ALGORITHM = "HS256" as const;

export interface Jwt {
  /** Sign a validated claim set into an HS256 token. */
  sign(claims: AuthClaims): string;
  /** Verify + decode a token; throws if signature/expiry/claims are invalid. */
  verify(token: string): AuthClaims;
  /** Escape hatch for tests: sign an arbitrary (possibly invalid) payload so
   * claim-validation on `verify` can be exercised. Not for production paths. */
  signRaw(payload: Record<string, unknown>): string;
}

/** Build a JWT signer/verifier bound to a secret. Used directly in tests; the
 * default export binds it to `AUTH_JWT_SECRET`. */
export function createJwt(secret: string): Jwt {
  return {
    sign(claims) {
      // Validate before signing so we never mint a token with bad claims.
      const valid = ClaimsSchema.parse(claims);
      return jwt.sign(valid, secret, {
        algorithm: ALGORITHM,
        expiresIn: EXPIRES_IN,
      });
    },

    verify(token) {
      // `algorithms` pins HS256 — reject `alg: none` and asymmetric forgeries.
      const decoded = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
      return ClaimsSchema.parse(decoded);
    },

    signRaw(payload) {
      return jwt.sign(payload, secret, { algorithm: ALGORITHM });
    },
  };
}
