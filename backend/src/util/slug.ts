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
 * The slug is independent crypto randomness — never derived from the runId or
 * any caller input — so it is overwhelmingly never equal to any existing value.
 * The store's UNIQUE index on `slug` is the real collision guard; no redraw
 * loop is needed (Constitution §8 — simplest impl, no dead code).
 */
const SLUG_BYTES = 18;

export function createSlug(): string {
  return randomBytes(SLUG_BYTES).toString("base64url");
}
