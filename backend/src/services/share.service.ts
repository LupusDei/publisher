import type { ShareLink } from "@publisher/shared";

/**
 * share.2.1 — the share service is the business-logic layer for shareable
 * preview URLs (Constitution §4: NO SQL here, no HTTP here). It owns the rules:
 * ownership, the published-status gate, idempotent mint, and resolve-by-slug.
 * It depends on narrow STRUCTURAL slices of the share store and run store so it
 * stays decoupled from SQLite.
 */

/** The slice of the ShareStore the service needs (structural — the real
 * `createShareStore` satisfies it). */
export interface ShareStoreSlice {
  create(input: {
    slug: string;
    runId: string;
    ownerId: string | null;
  }): { slug: string; runId: string; revokedAt: string | null };
  getBySlug(
    slug: string,
  ): { runId: string; revokedAt: string | null } | null;
  getActiveByRun(
    runId: string,
  ): { slug: string; runId: string; revokedAt: string | null } | null;
  revoke(runId: string): void;
}

/** The slice of the RunStore the service needs: status (for the published gate)
 * and ownership. */
export interface RunLookupSlice {
  get(id: string): { id: string; status: string } | null;
  ownerOf(id: string): string | null;
}

/** Raised when the caller does not own the run they are trying to share → 403. */
export class ShareForbiddenError extends Error {
  constructor(message = "You do not own this run") {
    super(message);
    this.name = "ShareForbiddenError";
  }
}

/** Raised when the run is not in a shareable (`published`) state → 409. */
export class ShareConflictError extends Error {
  constructor(message = "Run is not published") {
    super(message);
    this.name = "ShareConflictError";
  }
}

export interface ShareService {
  /**
   * Mint (or return the existing) public share link for `runId` on behalf of
   * `userId`. Idempotent: a run with an active share returns that share's link.
   * Throws {@link ShareForbiddenError} (non-owner) or {@link ShareConflictError}
   * (unknown or non-published run).
   */
  mint(runId: string, userId: string): ShareLink;
  /**
   * Resolve a slug to its runId, or null when the slug is unknown OR revoked.
   * The null-for-both is deliberate: the public route must not distinguish a
   * revoked link from one that never existed (no information leak).
   */
  resolveBySlug(slug: string): string | null;
}

export interface ShareServiceDeps {
  shareStore: ShareStoreSlice;
  runStore: RunLookupSlice;
  /** Injected slug generator (createSlug) — injected for deterministic tests. */
  slug: () => string;
  /** Public origin; the link is `${baseUrl}/p/${slug}` ("" → relative path). */
  baseUrl: string;
}

export function createShareService(deps: ShareServiceDeps): ShareService {
  const { shareStore, runStore, slug, baseUrl } = deps;

  const linkFor = (s: string): ShareLink => ({
    slug: s,
    url: `${baseUrl}/p/${s}`,
  });

  return {
    mint(runId, userId) {
      const run = runStore.get(runId);
      // Unknown OR non-published → 409 (and no leak of existence beyond the
      // owner, who already passed the route's ownership guard).
      if (!run || run.status !== "published") {
        throw new ShareConflictError();
      }
      const ownerId = runStore.ownerOf(runId);
      // An owned run shared by a non-owner is forbidden. Un-owned runs
      // (ownerId null) are shareable by any authed caller (mirrors run reads).
      if (ownerId !== null && ownerId !== userId) {
        throw new ShareForbiddenError();
      }
      // Idempotent: an existing active share wins — never mint a second.
      const active = shareStore.getActiveByRun(runId);
      if (active) return linkFor(active.slug);

      const created = shareStore.create({
        slug: slug(),
        runId,
        ownerId,
      });
      return linkFor(created.slug);
    },

    resolveBySlug(slugValue) {
      const share = shareStore.getBySlug(slugValue);
      if (!share || share.revokedAt !== null) return null;
      return share.runId;
    },
  };
}
