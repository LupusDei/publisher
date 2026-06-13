import { describe, it, expect, beforeEach } from "vitest";
import type { Share } from "@publisher/shared";
import {
  createShareService,
  ShareForbiddenError,
  ShareConflictError,
  type ShareStoreSlice,
  type RunLookupSlice,
} from "../../src/services/share.service.js";

/**
 * share.2.1 — the share service holds ALL the business rules (Constitution §4,
 * no SQL here): ownership, the published-status gate, idempotent mint, and
 * resolve-by-slug. We drive it with in-memory fakes of the two store slices it
 * depends on so the tests pin BEHAVIOR, not store internals. A deterministic
 * `slug` generator makes assertions exact.
 */

/** A minimal in-memory ShareStore fake honouring the active-run uniqueness the
 * real store enforces via its partial unique index. */
function fakeShareStore(): ShareStoreSlice & { rows: Share[] } {
  const rows: Share[] = [];
  return {
    rows,
    create({ slug, runId, ownerId }) {
      if (rows.some((r) => r.runId === runId && r.revokedAt === null)) {
        throw new Error("UNIQUE constraint failed: active share exists");
      }
      const share: Share = {
        slug,
        runId,
        ownerId,
        createdAt: "2026-06-13T00:00:00.000Z",
        revokedAt: null,
      };
      rows.push(share);
      return share;
    },
    getBySlug(slug) {
      return rows.find((r) => r.slug === slug) ?? null;
    },
    getActiveByRun(runId) {
      return rows.find((r) => r.runId === runId && r.revokedAt === null) ?? null;
    },
    revoke(runId) {
      const r = rows.find((x) => x.runId === runId && x.revokedAt === null);
      if (r) r.revokedAt = "2026-06-13T01:00:00.000Z";
    },
  };
}

/** A run-lookup fake: a fixed published run owned by u_owner, plus a
 * non-published run, plus unknown ids returning null. */
function fakeRunLookup(): RunLookupSlice {
  const runs: Record<string, { status: string; owner: string | null }> = {
    run_pub: { status: "published", owner: "u_owner" },
    run_unowned: { status: "published", owner: null },
    run_draft: { status: "building", owner: "u_owner" },
  };
  return {
    get(id) {
      const r = runs[id];
      return r ? { id, status: r.status } : null;
    },
    ownerOf(id) {
      return runs[id]?.owner ?? null;
    },
  };
}

function build(slugSeq: string[] = ["slug_aaaaaaaaaaaaaaa"]) {
  let i = 0;
  const shareStore = fakeShareStore();
  const service = createShareService({
    shareStore,
    runStore: fakeRunLookup(),
    slug: () => slugSeq[i++] ?? `slug_extra_${i}`,
    baseUrl: "",
  });
  return { service, shareStore };
}

describe("shareService.mint", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("should mint {slug,url} for an owned published run (happy path)", () => {
    const link = ctx.service.mint("run_pub", "u_owner");
    expect(link.slug).toBe("slug_aaaaaaaaaaaaaaa");
    expect(link.url).toBe("/p/slug_aaaaaaaaaaaaaaa");
    expect(ctx.shareStore.rows).toHaveLength(1);
  });

  it("should be idempotent — a 2nd mint returns the SAME active share (edge case)", () => {
    const first = ctx.service.mint("run_pub", "u_owner");
    const second = ctx.service.mint("run_pub", "u_owner");
    expect(second).toEqual(first);
    expect(ctx.shareStore.rows).toHaveLength(1);
  });

  it("should throw ShareForbiddenError when minting a run owned by another user (error path)", () => {
    expect(() => ctx.service.mint("run_pub", "u_intruder")).toThrow(
      ShareForbiddenError,
    );
    expect(ctx.shareStore.rows).toHaveLength(0);
  });

  it("should throw ShareConflictError when the run is not published (error path)", () => {
    expect(() => ctx.service.mint("run_draft", "u_owner")).toThrow(
      ShareConflictError,
    );
    expect(ctx.shareStore.rows).toHaveLength(0);
  });

  it("should throw ShareConflictError for an unknown run (edge case)", () => {
    expect(() => ctx.service.mint("run_missing", "u_owner")).toThrow(
      ShareConflictError,
    );
  });

  it("should build an absolute url from a non-empty baseUrl (edge case)", () => {
    const shareStore = fakeShareStore();
    const service = createShareService({
      shareStore,
      runStore: fakeRunLookup(),
      slug: () => "slug_bbbbbbbbbbbbbbb",
      baseUrl: "https://share.example.com",
    });
    expect(service.mint("run_pub", "u_owner").url).toBe(
      "https://share.example.com/p/slug_bbbbbbbbbbbbbbb",
    );
  });
});

describe("shareService.revoke", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("should revoke the active share for an owned run (happy path)", () => {
    const { slug } = ctx.service.mint("run_pub", "u_owner");
    // resolves before revoke
    expect(ctx.service.resolveBySlug(slug)).toBe("run_pub");
    ctx.service.revoke("run_pub", "u_owner");
    // the row is stamped revoked and no longer resolves (no oracle)
    expect(ctx.shareStore.rows[0]?.revokedAt).not.toBeNull();
    expect(ctx.service.resolveBySlug(slug)).toBeNull();
  });

  it("should be an idempotent no-op when there is no active share (edge case)", () => {
    // run_pub has never been shared — revoke must not throw and must not create rows
    expect(() => ctx.service.revoke("run_pub", "u_owner")).not.toThrow();
    expect(ctx.shareStore.rows).toHaveLength(0);
  });

  it("should be an idempotent no-op when the only share is already revoked (edge case)", () => {
    ctx.service.mint("run_pub", "u_owner");
    ctx.service.revoke("run_pub", "u_owner");
    const revokedAt = ctx.shareStore.rows[0]?.revokedAt;
    // a second revoke changes nothing (no active share to stamp)
    expect(() => ctx.service.revoke("run_pub", "u_owner")).not.toThrow();
    expect(ctx.shareStore.rows[0]?.revokedAt).toBe(revokedAt);
    expect(ctx.shareStore.rows).toHaveLength(1);
  });

  it("should throw ShareForbiddenError when a non-owner revokes an owned run's share (error path)", () => {
    const { slug } = ctx.service.mint("run_pub", "u_owner");
    expect(() => ctx.service.revoke("run_pub", "u_intruder")).toThrow(
      ShareForbiddenError,
    );
    // the share is untouched — still resolves
    expect(ctx.service.resolveBySlug(slug)).toBe("run_pub");
  });

  it("should allow any authed caller to revoke an un-owned run's share (edge case)", () => {
    const { slug } = ctx.service.mint("run_unowned", "u_anyone");
    expect(() =>
      ctx.service.revoke("run_unowned", "u_anyone"),
    ).not.toThrow();
    expect(ctx.service.resolveBySlug(slug)).toBeNull();
  });
});

describe("shareService.resolveBySlug", () => {
  it("should return the runId for an active slug (happy path)", () => {
    const ctx = build();
    const { slug } = ctx.service.mint("run_pub", "u_owner");
    expect(ctx.service.resolveBySlug(slug)).toBe("run_pub");
  });

  it("should return null for an unknown slug (error/edge path)", () => {
    const ctx = build();
    expect(ctx.service.resolveBySlug("nope_000000000000")).toBeNull();
  });

  it("should return null for a revoked slug (no oracle — edge case)", () => {
    const ctx = build();
    const { slug } = ctx.service.mint("run_pub", "u_owner");
    ctx.shareStore.revoke("run_pub");
    expect(ctx.service.resolveBySlug(slug)).toBeNull();
  });
});
