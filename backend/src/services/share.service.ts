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
   * Revoke `runId`'s active share on behalf of `userId`. Idempotent: with no
   * active share this is a clean no-op (mirrors the spec's revoke-no-op edge
   * case → the route returns 204, not an error). Throws {@link
   * ShareForbiddenError} when an owned run is revoked by a non-owner. After a
   * successful revoke the run's slug no longer resolves (public route 404s).
   */
  revoke(runId: string, userId: string): void;
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

      try {
        const created = shareStore.create({
          slug: slug(),
          runId,
          ownerId,
        });
        return linkFor(created.slug);
      } catch (err) {
        // Concurrent-mint race: a parallel caller committed the active share
        // between our getActiveByRun check and our create, so the store's
        // partial unique index (idx_shares_active_run) rejected this insert.
        // Re-read and return the winner's link — identical to the sequential
        // idempotent path (spec edge case: "second call returns the first").
        // Only rethrow if no active share actually exists (a real failure).
        const raced = shareStore.getActiveByRun(runId);
        if (raced) return linkFor(raced.slug);
        throw err;
      }
    },

    revoke(runId, userId) {
      // Idempotent: with no active share there is nothing to revoke — a clean
      // no-op (the route surfaces this as 204, never an error).
      const active = shareStore.getActiveByRun(runId);
      if (!active) return;
      const ownerId = runStore.ownerOf(runId);
      // An owned run revoked by a non-owner is forbidden. Un-owned runs
      // (ownerId null) are revocable by any authed caller (mirrors mint).
      if (ownerId !== null && ownerId !== userId) {
        throw new ShareForbiddenError();
      }
      shareStore.revoke(runId);
    },

    resolveBySlug(slugValue) {
      const share = shareStore.getBySlug(slugValue);
      if (!share || share.revokedAt !== null) return null;
      return share.runId;
    },
  };
}
