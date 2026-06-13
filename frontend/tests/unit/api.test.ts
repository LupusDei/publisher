import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchHealth } from "@/lib/api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return parsed health on a 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ status: "ok", version: "1.0.0", uptimeSeconds: 5 }),
      ),
    );
    const health = await fetchHealth("http://api.test");
    expect(health.status).toBe("ok");
    expect(health.version).toBe("1.0.0");
  });

  it("should throw a descriptive error on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    await expect(fetchHealth("http://api.test")).rejects.toThrow(/HTTP 503/);
  });

  it("should call the configured base URL's /health path", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ status: "ok", version: "1", uptimeSeconds: 0 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchHealth("http://base:9000");
    expect(fetchMock).toHaveBeenCalledWith("http://base:9000/health");
  });
});
