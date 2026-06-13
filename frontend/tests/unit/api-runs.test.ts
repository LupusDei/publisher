import { describe, it, expect, vi, afterEach } from "vitest";
import { startRun, fetchRunEvents, publishedUrl } from "@/lib/api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("run API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("startRun should POST and return the started run on success", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        runId: "run_1",
        receipt: {
          id: "run_1",
          url: "/published/run_1",
          bytes: 10,
          publishedAt: "t",
          workerId: "mock",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await startRun(
      { personaId: "p_1", concept: "c" },
      "http://api.test",
    );
    expect(out.runId).toBe("run_1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/runs",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("startRun should throw a descriptive error on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    await expect(
      startRun({ personaId: "x", concept: "c" }, "http://api.test"),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("fetchRunEvents should unwrap the events array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          events: [{ runId: "run_1", seq: 0, ts: "t", t: "phase" }],
        }),
      ),
    );
    const events = await fetchRunEvents("run_1", "http://api.test");
    expect(events).toHaveLength(1);
    expect(events[0]?.t).toBe("phase");
  });

  it("fetchRunEvents should throw on a non-ok response (error path)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 500 })),
    );
    await expect(fetchRunEvents("run_1", "http://api.test")).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it("publishedUrl should build the /published/:id URL (edge case)", () => {
    expect(publishedUrl("run_1", "http://api.test")).toBe(
      "http://api.test/published/run_1",
    );
  });
});
