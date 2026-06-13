import { describe, it, expect, vi, afterEach } from "vitest";
import {
  startRun,
  fetchRun,
  fetchRuns,
  fetchPersonaSummaries,
  fetchRunEvents,
  postDecision,
  fetchCompiledGuardrails,
  publishedUrl,
  streamUrl,
  AVAILABLE_WORKERS,
} from "@/app/runs/run-api";
import { writeToken, clearToken } from "@/app/auth/auth-api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("run-api client", () => {
  it("startRun should POST persona/concept/worker and return the runId (happy path)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ runId: "run_1" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await startRun(
      { personaId: "p_1", concept: "c", workerId: "sonnet" },
      "http://api.test",
    );
    expect(out.runId).toBe("run_1");
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      personaId: "p_1",
      workerId: "sonnet",
    });
  });

  it("startRun should surface a structured validation error (error path)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { error: { issues: [{ path: "concept", message: "required" }] } },
          400,
        ),
      ),
    );
    await expect(
      startRun({ personaId: "p", concept: "" }, "http://api.test"),
    ).rejects.toThrow(/concept: required/);
  });

  it("fetchRun should return the run header (happy path)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ id: "run_1", status: "published" })),
    );
    const run = await fetchRun("run_1", "http://api.test");
    expect(run.id).toBe("run_1");
  });

  it("fetchRuns should return the bare array the backend sends (real shape)", async () => {
    // GET /runs returns a BARE array (backend contract — runs.test.ts asserts
    // Array.isArray(res.body)). Mock the real shape, not a {runs} envelope.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([{ id: "a" }, { id: "b" }])),
    );
    const runs = await fetchRuns("http://api.test");
    expect(runs).toHaveLength(2);
  });

  it("fetchRuns should always resolve to an array, never undefined (regression)", async () => {
    // Defensive: a missing/odd body must not become `undefined` (that crashed
    // the /runs page at `runs.length`). Also tolerate a {runs} envelope.
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    expect(await fetchRuns("http://api.test")).toEqual([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ runs: [{ id: "x" }] })),
    );
    expect(await fetchRuns("http://api.test")).toHaveLength(1);
  });

  it("fetchPersonaSummaries should unwrap the {personas} envelope (real shape)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ personas: [{ id: "p1", name: "A" }] })),
    );
    const personas = await fetchPersonaSummaries("http://api.test");
    expect(personas).toHaveLength(1);
    expect(personas[0]?.id).toBe("p1");
  });

  it("fetchPersonaSummaries should tolerate a bare array and never return undefined (regression)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([{ id: "p2", name: "B" }])),
    );
    expect(await fetchPersonaSummaries("http://api.test")).toHaveLength(1);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    expect(await fetchPersonaSummaries("http://api.test")).toEqual([]);
  });

  it("fetchRunEvents should append sinceSeq for catch-up and unwrap events (edge case)", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL) =>
      jsonResponse({ events: [{ runId: "r", seq: 3, ts: "t", t: "phase" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const events = await fetchRunEvents("r", 2, "http://api.test");
    expect(events).toHaveLength(1);
    // The client routes through authFetch, so a (possibly empty) init object
    // travels alongside the URL; assert on the URL argument.
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://api.test/runs/r/events?sinceSeq=2",
    );
  });

  it("fetchRunEvents should omit the query when sinceSeq is negative (edge case)", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL) =>
      jsonResponse({ events: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchRunEvents("r", -1, "http://api.test");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.test/runs/r/events");
  });

  it("fetchRunEvents should throw on a non-ok response (error path)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 500 })),
    );
    await expect(fetchRunEvents("r", -1, "http://api.test")).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it("postDecision should POST the choice and payload (happy path)", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await postDecision("r", { choice: "approve_anyway" }, "http://api.test");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://api.test/runs/r/decision");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("postDecision should throw a descriptive error on failure (error path)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 409 })),
    );
    await expect(
      postDecision("r", { choice: "abort" }, "http://api.test"),
    ).rejects.toThrow(/HTTP 409/);
  });

  it("fetchCompiledGuardrails should return the systemPrompt + validators (R3 happy path)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          systemPrompt: "You are...",
          validators: [
            { rule: "design-token", kind: "deterministic", description: "d" },
          ],
        }),
      ),
    );
    const out = await fetchCompiledGuardrails("p_1", "http://api.test");
    expect(out.validators[0]?.rule).toBe("design-token");
  });

  it("fetchCompiledGuardrails should throw on a 404 (error path)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 404 })),
    );
    await expect(
      fetchCompiledGuardrails("missing", "http://api.test"),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("publishedUrl should pass through absolute URLs and prefix relative paths", () => {
    expect(
      publishedUrl("https://x.test/published/run_1", "http://api.test"),
    ).toBe("https://x.test/published/run_1");
    expect(publishedUrl("/published/run_1", "http://api.test")).toBe(
      "http://api.test/published/run_1",
    );
    expect(publishedUrl({ url: "published/run_1" }, "http://api.test")).toBe(
      "http://api.test/published/run_1",
    );
  });

  it("streamUrl should append sinceSeq when given and omit it otherwise (edge case)", () => {
    clearToken();
    expect(streamUrl("r", 4, "http://api.test")).toBe(
      "http://api.test/runs/r/stream?sinceSeq=4",
    );
    expect(streamUrl("r", undefined, "http://api.test")).toBe(
      "http://api.test/runs/r/stream",
    );
  });

  it("streamUrl should append the stored JWT as ?token= for header-free SSE auth (publisher-2aa)", () => {
    writeToken("jwt-abc");
    try {
      // EventSource can't set Authorization, so the token rides in the query.
      expect(streamUrl("r", undefined, "http://api.test")).toBe(
        "http://api.test/runs/r/stream?token=jwt-abc",
      );
      // ...alongside the reconnect cursor when both are present.
      expect(streamUrl("r", 4, "http://api.test")).toBe(
        "http://api.test/runs/r/stream?sinceSeq=4&token=jwt-abc",
      );
    } finally {
      clearToken();
    }
  });

  it("AVAILABLE_WORKERS should expose at least two swappable workers (R11)", () => {
    expect(AVAILABLE_WORKERS.length).toBeGreaterThanOrEqual(2);
    expect(AVAILABLE_WORKERS.map((w) => w.id)).toContain("sonnet");
  });
});
