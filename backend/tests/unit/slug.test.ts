import { describe, it, expect } from "vitest";
import { createSlug } from "../../src/util/slug.js";

/**
 * share.1.2 — the share slug must be an UNGUESSABLE, non-enumerable, url-safe
 * token (≥16 chars over [A-Za-z0-9_-]) and NEVER derived from the runId. These
 * tests pin those three properties: shape, uniqueness over many draws, and
 * independence from any input the caller might supply.
 */
const SLUG_RE = /^[A-Za-z0-9_-]{16,}$/;

describe("createSlug", () => {
  it("should produce a url-safe token of at least 16 chars (happy path)", () => {
    const slug = createSlug();
    expect(slug).toMatch(SLUG_RE);
    expect(slug.length).toBeGreaterThanOrEqual(16);
  });

  it("should produce distinct slugs across many draws (uniqueness)", () => {
    const draws = 1000;
    const seen = new Set<string>();
    for (let i = 0; i < draws; i += 1) seen.add(createSlug());
    // Crypto-strong randomness over ≥16 url-safe chars makes a collision in
    // 1000 draws astronomically unlikely; any collision is a real defect.
    expect(seen.size).toBe(draws);
  });

  it("should never equal a runId — the slug is independent randomness (edge case)", () => {
    // The slug is crypto randomness, never derived from the runId, so it must
    // not collide with a runId-shaped value (no enumeration leak). The store's
    // UNIQUE index is the real guard, so createSlug takes no collision arg.
    const runId = "run_0123456789abcdef";
    for (let i = 0; i < 100; i += 1) {
      expect(createSlug()).not.toBe(runId);
    }
  });

  it("should only ever emit characters from the url-safe alphabet (edge case)", () => {
    const joined = Array.from({ length: 200 }, () => createSlug()).join("");
    expect(joined).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
