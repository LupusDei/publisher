import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeToken } from "@/app/auth/auth-api";
import { startRun, fetchRuns, fetchRun } from "@/app/runs/run-api";
import {
  createPersona,
  fetchPersonas,
  fetchPersona,
} from "@/app/personas/persona-api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The Authorization header on the most recent fetch call. */
function lastAuthHeader(mock: ReturnType<typeof vi.fn>): string | null {
  const init = mock.mock.calls.at(-1)?.[1] as RequestInit | undefined;
  return new Headers(init?.headers).get("authorization");
}

describe("API clients attach the Bearer token", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("run-api startRun should carry the stored token (happy path)", async () => {
    writeToken("tok_run");
    const fetchMock = vi.fn(async () => jsonResponse({ runId: "r1" }));
    vi.stubGlobal("fetch", fetchMock);

    await startRun({ personaId: "p", concept: "c" }, "http://api.test");
    expect(lastAuthHeader(fetchMock)).toBe("Bearer tok_run");
  });

  it("run-api fetchRuns should carry the stored token (read path)", async () => {
    writeToken("tok_run");
    const fetchMock = vi.fn(async () => jsonResponse({ runs: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchRuns("http://api.test");
    expect(lastAuthHeader(fetchMock)).toBe("Bearer tok_run");
  });

  it("run-api fetchRun should NOT send an auth header when signed out (edge)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "r1" }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchRun("r1", "http://api.test");
    expect(lastAuthHeader(fetchMock)).toBeNull();
  });

  it("persona-api createPersona should carry the stored token (happy path)", async () => {
    writeToken("tok_persona");
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: "p1", name: "n" }, 201),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createPersona(
      {
        name: "n",
        voice: "v",
        voiceSample: "s",
        stylePoints: [],
        keyLearnings: [],
        designElements: {},
      },
      "http://api.test",
    );
    expect(lastAuthHeader(fetchMock)).toBe("Bearer tok_persona");
  });

  it("persona-api fetchPersonas should carry the stored token (read path)", async () => {
    writeToken("tok_persona");
    const fetchMock = vi.fn(async () => jsonResponse({ personas: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchPersonas("http://api.test");
    expect(lastAuthHeader(fetchMock)).toBe("Bearer tok_persona");
  });

  it("persona-api fetchPersona should NOT send an auth header when signed out (edge)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "p1", name: "n" }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchPersona("p1", "http://api.test");
    expect(lastAuthHeader(fetchMock)).toBeNull();
  });
});
