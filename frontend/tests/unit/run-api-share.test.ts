import { describe, it, expect, vi, afterEach } from "vitest";
import { createShare, fetchShare, revokeShare } from "@/app/runs/run-api";

/**
 * share.3.1 — the share API client (createShare / fetchShare / revokeShare).
 *
 * All three route through `authFetch`, so fetch is stubbed and the URL/method
 * are asserted on the call args. The mocked bodies use the REAL backend shapes:
 * the mint route returns `{ slug, url }` (ShareLinkSchema), DELETE returns 204
 * (no body), and the (tolerant) GET returns either a ShareLink-ish body or a
 * 404 the client maps to `null`.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("run-api share client", () => {
  it("createShare should POST /runs/:id/share and return the parsed {slug,url} (happy path)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ slug: "abcDEF1234567890zz", url: "http://api.test/p/abcDEF1234567890zz" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const link = await createShare("run_1", "http://api.test");

    expect(link).toEqual({
      slug: "abcDEF1234567890zz",
      url: "http://api.test/p/abcDEF1234567890zz",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://api.test/runs/run_1/share");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("createShare should surface a structured error on 403 (error path)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { message: "Not your run" } }, 403),
      ),
    );
    await expect(createShare("run_1", "http://api.test")).rejects.toThrow(
      /Not your run/,
    );
  });

  it("createShare should reject a malformed body that fails ShareLinkSchema (edge case)", async () => {
    // Defensive: a 200 with a non-conforming payload (missing url) must not be
    // returned as a valid ShareLink — the schema is the boundary guard.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ slug: "x" })),
    );
    await expect(createShare("run_1", "http://api.test")).rejects.toThrow();
  });

  it("fetchShare should GET /runs/:id/share and return the active share (happy path)", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      jsonResponse({ slug: "abcDEF1234567890zz", url: "http://api.test/p/abcDEF1234567890zz" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const share = await fetchShare("run_1", "http://api.test");

    expect(share).toEqual({
      slug: "abcDEF1234567890zz",
      url: "http://api.test/p/abcDEF1234567890zz",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://api.test/runs/run_1/share");
    // No explicit method → defaults to GET.
    expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
  });

  it("fetchShare should return null when there is no active share / no read endpoint (404-tolerant)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect(await fetchShare("run_1", "http://api.test")).toBeNull();
  });

  it("fetchShare should return null for an unparseable body rather than throw (edge case)", async () => {
    // The read path must never crash the UI — a malformed body degrades to null
    // (UI shows "Get share link"), it does not reject.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ nope: true })),
    );
    expect(await fetchShare("run_1", "http://api.test")).toBeNull();
  });

  it("revokeShare should DELETE /runs/:id/share and resolve on 204 (happy path)", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await revokeShare("run_1", "http://api.test");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://api.test/runs/run_1/share");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("revokeShare should treat 404 (nothing to revoke) as a no-op success (edge case)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(revokeShare("run_1", "http://api.test")).resolves.toBeUndefined();
  });

  it("revokeShare should throw a descriptive error on a non-2xx/404 failure (error path)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { message: "Not your run" } }, 403),
      ),
    );
    await expect(revokeShare("run_1", "http://api.test")).rejects.toThrow(
      /Not your run/,
    );
  });
});
