import { z } from "zod";

/**
 * Contracts for the shareable-preview-URL feature (Epic publisher-share).
 *
 * A `share` maps an unguessable url-safe slug to a run so an anonymous browser
 * can load the run's self-contained HTML via `GET /p/:slug`. The slug is NEVER
 * the runId. `ownerId` is nullable to mirror `runs.user_id` nullability;
 * `revokedAt` is null while the share is active and is stamped on revoke (no
 * TTL — revoke is the only deactivation).
 */
export const ShareSchema = z.object({
  /** url-safe, unguessable, ≥16 chars — validated at the route boundary too. */
  slug: z.string().min(1),
  /** The run this share exposes. */
  runId: z.string().min(1),
  /** Owning user, or null for an un-owned/seeded run. */
  ownerId: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
  /** null = active; an ISO timestamp = revoked (then `GET /p/:slug` 404s). */
  revokedAt: z.string().min(1).nullable(),
});
export type Share = z.infer<typeof ShareSchema>;

/**
 * The thin payload the mint route returns: the slug plus the fully-built public
 * URL (`${PUBLIC_BASE_URL}/p/${slug}`, or a relative `/p/${slug}` when unset).
 */
export const ShareLinkSchema = z.object({
  slug: z.string().min(1),
  url: z.string().min(1),
});
export type ShareLink = z.infer<typeof ShareLinkSchema>;
