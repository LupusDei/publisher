import { describe, it, expect } from "vitest";
import { ShareSchema, ShareLinkSchema } from "../../src/index.js";

/**
 * share.1.3 — contracts for the shareable-preview-URL feature. `ShareSchema`
 * validates a persisted share row at the DB boundary (the store maps snake_case
 * columns → these camelCase fields before parsing). `ShareLinkSchema` is the
 * thin `{slug,url}` payload the mint route returns. The fixtures below use REAL
 * row/response shapes, not type-definition stand-ins (Constitution §1).
 */

// A real active-share row (revoked_at NULL → revokedAt null), as the store
// would hand it to ShareSchema.parse after column→field mapping.
const activeRow = {
  slug: "Zx9_QmA1bC2dE3fG4hI5jK6l",
  runId: "run_0123456789abcdef",
  ownerId: "u_owner",
  createdAt: "2026-06-13T00:00:00.000Z",
  revokedAt: null,
};

describe("ShareSchema", () => {
  it("should parse a real active-share DB row (happy path)", () => {
    const parsed = ShareSchema.parse(activeRow);
    expect(parsed).toEqual(activeRow);
  });

  it("should parse a revoked row (revokedAt set) and a null owner (edge case)", () => {
    const revoked = {
      ...activeRow,
      ownerId: null,
      revokedAt: "2026-06-13T01:00:00.000Z",
    };
    const parsed = ShareSchema.parse(revoked);
    expect(parsed.ownerId).toBeNull();
    expect(parsed.revokedAt).toBe("2026-06-13T01:00:00.000Z");
  });

  it("should reject an empty slug (error path)", () => {
    expect(ShareSchema.safeParse({ ...activeRow, slug: "" }).success).toBe(
      false,
    );
  });

  it("should reject a too-short slug (< 16 chars) (error path)", () => {
    // The documented contract + the public route both require an unguessable
    // ≥16-char url-safe slug; the schema must enforce that floor, not just
    // min(1). 15 chars is one below the boundary.
    expect(
      ShareSchema.safeParse({ ...activeRow, slug: "abcDEF123_-xyzW" }).success,
    ).toBe(false);
  });

  it("should reject a slug with non-url-safe characters (error path)", () => {
    // Dots, slashes, and other punctuation fall outside the [A-Za-z0-9_-]
    // alphabet the generator and route enforce.
    expect(
      ShareSchema.safeParse({
        ...activeRow,
        slug: "has.dots.and/slashes!!",
      }).success,
    ).toBe(false);
  });

  it("should accept a valid ≥16-char url-safe slug (happy path)", () => {
    // A 24-char base64url token — exactly what createSlug() emits — validates.
    expect(
      ShareSchema.safeParse({
        ...activeRow,
        slug: "Zx9_QmA1bC2dE3fG4hI5jK6l",
      }).success,
    ).toBe(true);
  });

  it("should reject a missing runId (error path)", () => {
    const { runId: _omit, ...noRun } = activeRow;
    expect(ShareSchema.safeParse(noRun).success).toBe(false);
  });
});

describe("ShareLinkSchema", () => {
  it("should parse a real mint response {slug,url} (happy path)", () => {
    const link = {
      slug: "Zx9_QmA1bC2dE3fG4hI5jK6l",
      url: "/p/Zx9_QmA1bC2dE3fG4hI5jK6l",
    };
    expect(ShareLinkSchema.parse(link)).toEqual(link);
  });

  it("should parse an absolute url built from PUBLIC_BASE_URL (edge case)", () => {
    const link = {
      slug: "Zx9_QmA1bC2dE3fG4hI5jK6l",
      url: "https://share.example.com/p/Zx9_QmA1bC2dE3fG4hI5jK6l",
    };
    expect(ShareLinkSchema.parse(link).url).toContain("https://");
  });

  it("should reject an empty slug (error path)", () => {
    expect(
      ShareLinkSchema.safeParse({ slug: "", url: "/p/x" }).success,
    ).toBe(false);
  });
});
