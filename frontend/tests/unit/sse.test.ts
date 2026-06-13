import { describe, it, expect, vi, afterEach } from "vitest";
import { parseRunEvent, eventSourceStream } from "@/app/runs/sse";

afterEach(() => vi.unstubAllGlobals());

describe("parseRunEvent", () => {
  it("should parse a well-formed RunEvent payload (happy path)", () => {
    const raw = JSON.stringify({
      runId: "r",
      seq: 2,
      ts: "t",
      t: "phase",
      phase: "build",
    });
    const parsed = parseRunEvent(raw);
    expect(parsed?.t).toBe("phase");
    expect(parsed?.seq).toBe(2);
  });

  it("should return null for malformed JSON (error path)", () => {
    expect(parseRunEvent("{not json")).toBeNull();
  });

  it("should return null when required envelope fields are missing (edge case)", () => {
    expect(parseRunEvent(JSON.stringify({ t: "phase" }))).toBeNull();
  });
});

describe("eventSourceStream", () => {
  it("should return an inert source when EventSource is unavailable (SSR/test edge case)", () => {
    // jsdom has no EventSource by default; ensure no throw + close is a no-op.
    const src = eventSourceStream("http://api.test/runs/r/stream");
    src.onEvent(() => {});
    src.onOpen(() => {});
    src.onError(() => {});
    expect(() => src.close()).not.toThrow();
  });

  it("should wire EventSource handlers and forward parsed events (happy path)", () => {
    const instances: FakeES[] = [];
    class FakeES {
      url: string;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      closed = false;
      constructor(url: string) {
        this.url = url;
        instances.push(this);
      }
      close(): void {
        this.closed = true;
      }
    }
    vi.stubGlobal("EventSource", FakeES);

    const events: string[] = [];
    let opened = false;
    let errored = false;
    const src = eventSourceStream("http://api.test/runs/r/stream?sinceSeq=3");
    src.onEvent((e) => events.push(e.t));
    src.onOpen(() => {
      opened = true;
    });
    src.onError(() => {
      errored = true;
    });

    const es = instances[0]!;
    expect(es.url).toContain("sinceSeq=3");
    es.onopen?.();
    es.onmessage?.({
      data: JSON.stringify({
        runId: "r",
        seq: 0,
        ts: "t",
        t: "phase",
        phase: "research",
      }),
    });
    es.onmessage?.({ data: "garbage" }); // dropped, not forwarded
    es.onerror?.();

    expect(opened).toBe(true);
    expect(errored).toBe(true);
    expect(events).toEqual(["phase"]);

    src.close();
    expect(es.closed).toBe(true);
  });
});
