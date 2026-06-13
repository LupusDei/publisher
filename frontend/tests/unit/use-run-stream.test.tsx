import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { RunEvent } from "@publisher/shared";
import { useRunStream } from "@/app/runs/use-run-stream";
import type { RunStreamSource } from "@/app/runs/sse";
import { mockRunEvents } from "@/app/runs/mock-stream";

/** A controllable in-memory stream source for deterministic hook tests. */
function controllableSource(): {
  source: RunStreamSource;
  open: () => void;
  emit: (e: RunEvent) => void;
  fail: () => void;
  closed: () => boolean;
} {
  let onEvent = (_e: RunEvent): void => {};
  let onOpen = (): void => {};
  let onError = (): void => {};
  let isClosed = false;
  return {
    source: {
      onEvent: (h) => {
        onEvent = h;
      },
      onOpen: (h) => {
        onOpen = h;
      },
      onError: (h) => {
        onError = h;
      },
      close: () => {
        isClosed = true;
      },
    },
    open: () => onOpen(),
    emit: (e) => onEvent(e),
    fail: () => onError(),
    closed: () => isClosed,
  };
}

describe("useRunStream", () => {
  it("should stay idle when no runId is provided (initial state)", () => {
    const { result } = renderHook(() => useRunStream({}));
    expect(result.current.connection).toBe("idle");
    expect(result.current.view.status).toBe("created");
  });

  it("should go live on open and fold events into the view (state change)", () => {
    const ctrl = controllableSource();
    const { result } = renderHook(() =>
      useRunStream({ runId: "r", sourceFactory: () => ctrl.source }),
    );
    expect(result.current.connection).toBe("connecting");
    act(() => ctrl.open());
    expect(result.current.connection).toBe("live");
    act(() => {
      ctrl.emit({ runId: "r", seq: 0, ts: "t", t: "phase", phase: "research" });
    });
    expect(result.current.view.phase).toBe("research");
  });

  it("should enter the error state on a transport error (error handling)", () => {
    const ctrl = controllableSource();
    const { result } = renderHook(() =>
      useRunStream({ runId: "r", sourceFactory: () => ctrl.source }),
    );
    act(() => ctrl.fail());
    expect(result.current.connection).toBe("error");
  });

  it("should reconnect from the last folded seq (D5 reconnect)", () => {
    let lastSinceSeq = -99;
    const sources: ReturnType<typeof controllableSource>[] = [];
    const factory = (_id: string, sinceSeq: number): RunStreamSource => {
      lastSinceSeq = sinceSeq;
      const c = controllableSource();
      sources.push(c);
      return c.source;
    };
    const { result } = renderHook(() =>
      useRunStream({ runId: "r", sourceFactory: factory }),
    );
    act(() => sources[0]!.open());
    act(() => {
      sources[0]!.emit({ runId: "r", seq: 0, ts: "t", t: "phase", phase: "research" });
      sources[0]!.emit({ runId: "r", seq: 1, ts: "t", t: "phase", phase: "build" });
    });
    // Drop, then reconnect — the new source must open with sinceSeq = 1.
    act(() => sources[0]!.fail());
    act(() => result.current.reconnect());
    expect(lastSinceSeq).toBe(1);
    expect(result.current.connection).toBe("reconnecting");
  });

  it("should close the stream on a terminal published event (terminal)", () => {
    const ctrl = controllableSource();
    const { result } = renderHook(() =>
      useRunStream({ runId: "r", sourceFactory: () => ctrl.source }),
    );
    act(() => ctrl.open());
    act(() => {
      for (const e of mockRunEvents("r")) ctrl.emit(e);
    });
    expect(result.current.view.status).toBe("published");
    expect(result.current.connection).toBe("closed");
    expect(ctrl.closed()).toBe(true);
  });
});
