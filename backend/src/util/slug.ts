import { randomBytes } from "node:crypto";

/**
 * share.1.2 — mint an unguessable, non-enumerable share slug.
 *
 * The slug keys the public `GET /p/:slug` route, so it MUST be unpredictable
 * (crypto-strong randomness, never derived from the runId or any caller input)
 * and url-safe. We base64url-encode crypto random bytes and strip padding,
 * yielding the alphabet `[A-Za-z0-9_-]` — exactly the shape the public route
 * validates before any lookup. 18 random bytes → 24 url-safe chars (well over
 * the ≥16 floor), giving ~144 bits of entropy: probing the route reveals
 * nothing about which runs exist.
 *
 * The optional `_collisionAvoid` arg lets a caller signal a value to avoid
 * (e.g. a runId) for defense-in-depth; because the slug is independent
 * randomness it is overwhelmingly never equal to that value already, but on the
 * astronomically rare match we redraw — the slug is NEVER the input.
 */
const SLUG_BYTES = 18;

export function createSlug(_collisionAvoid?: string): string {
  // Redraw on the (effectively impossible) event that the random token equals
  // the value the caller asked us to avoid. Bounded loop: it terminates after
  // one iteration in every realistic run.
  for (;;) {
    const slug = randomBytes(SLUG_BYTES).toString("base64url");
    if (slug !== _collisionAvoid) return slug;
  }
}
