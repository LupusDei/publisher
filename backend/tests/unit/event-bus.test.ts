import { describe, it, expect } from "vitest";
import { createEventBus } from "../../src/orchestrator/event-bus.js";
import type { RunEvent } from "@publisher/shared";

function phaseEvent(runId: string, seq: number): RunEvent {
  return { runId, seq, ts: "t", t: "phase", phase: "research" };
}

describe("createEventBus", () => {
  it("should deliver published events to a subscriber of the same run", () => {
    const bus = createEventBus();
    const received: number[] = [];
    bus.subscribe("run_1", (e) => received.push(e.seq));
    bus.publish(phaseEvent("run_1", 0));
    bus.publish(phaseEvent("run_1", 1));
    expect(received).toEqual([0, 1]);
  });

  it("should not deliver events for other runs (isolation)", () => {
    const bus = createEventBus();
    const received: number[] = [];
    bus.subscribe("run_1", (e) => received.push(e.seq));
    bus.publish(phaseEvent("run_2", 0));
    expect(received).toEqual([]);
  });

  it("should stop delivering after unsubscribe (edge — cleanup)", () => {
    const bus = createEventBus();
    const received: number[] = [];
    const off = bus.subscribe("run_1", (e) => received.push(e.seq));
    bus.publish(phaseEvent("run_1", 0));
    off();
    bus.publish(phaseEvent("run_1", 1));
    expect(received).toEqual([0]);
  });

  it("should tolerate publishing with no subscribers", () => {
    const bus = createEventBus();
    expect(() => bus.publish(phaseEvent("run_x", 0))).not.toThrow();
  });
});
