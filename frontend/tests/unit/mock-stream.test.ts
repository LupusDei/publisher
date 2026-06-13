import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RunEventSchema } from "@publisher/shared";
import {
  mockRunEvents,
  mockEscalationEvents,
  mockApprovalEvents,
  mockFailureEvents,
  playMockStream,
} from "@/app/runs/mock-stream";

describe("mock-stream fixtures", () => {
  it("should emit events with strictly monotonic seq and valid contracts (happy path)", () => {
    const events = mockRunEvents("r");
    let prev = -1;
    for (const e of events) {
      expect(e.seq).toBeGreaterThan(prev);
      prev = e.seq;
      // Every event must satisfy the shared RunEvent contract.
      expect(() => RunEventSchema.parse(e)).not.toThrow();
    }
  });

  it("should encode the VOICE_DRIFT 0.42 -> 0.81 redraft narrative (R2 money shot)", () => {
    const events = mockRunEvents("r");
    const drafts = events.filter((e) => e.t === "draft");
    expect(drafts).toHaveLength(2);
    const alarm = events.find((e) => e.t === "alarm");
    expect(alarm?.t === "alarm" && alarm.alarm.type).toBe("VOICE_DRIFT");
  });

  it("should end the happy path with a published receipt (terminal)", () => {
    const events = mockRunEvents("r");
    const last = events[events.length - 1]!;
    expect(last.t).toBe("published");
  });

  it("should pause on a critical escalation in the escalation fixture (R10)", () => {
    const events = mockEscalationEvents("r");
    const esc = events.find((e) => e.t === "escalation");
    expect(esc?.t === "escalation" && esc.escalation.options).toContain(
      "enrich_persona",
    );
  });

  it("should pause at the AWAITING_APPROVAL gate when unresolved (final HITL gate)", () => {
    const events = mockApprovalEvents("r");
    // Contract-valid and strictly monotonic.
    let prev = -1;
    for (const e of events) {
      expect(e.seq).toBeGreaterThan(prev);
      prev = e.seq;
      expect(() => RunEventSchema.parse(e)).not.toThrow();
    }
    const last = events[events.length - 1]!;
    expect(last.t).toBe("escalation");
    expect(last.t === "escalation" && last.escalation.alarm.type).toBe(
      "AWAITING_APPROVAL",
    );
    // No publish/failed tail while unresolved.
    expect(events.some((e) => e.t === "published")).toBe(false);
  });

  it("should append a published receipt when the approval gate is approved (publish tail)", () => {
    const events = mockApprovalEvents("r", "publish");
    const last = events[events.length - 1]!;
    expect(last.t).toBe("published");
    expect(events.some((e) => e.t === "resumed")).toBe(true);
  });

  it("should append a failed reason when the approval gate is discarded (discard tail)", () => {
    const events = mockApprovalEvents("r", "discard");
    const last = events[events.length - 1]!;
    expect(last.t).toBe("failed");
    expect(last.t === "failed" && last.reason).toMatch(/Discarded by reviewer/);
  });

  it("should end the failure fixture with a failed reason (refused to publish)", () => {
    const events = mockFailureEvents("r");
    const last = events[events.length - 1]!;
    expect(last.t).toBe("failed");
  });
});

describe("playMockStream", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("should deliver events one-by-one and call onDone at the end (happy path)", () => {
    const events = mockFailureEvents("r");
    const seen: number[] = [];
    let done = false;
    playMockStream(events, (e) => seen.push(e.seq), {
      intervalMs: 10,
      onDone: () => {
        done = true;
      },
    });
    vi.advanceTimersByTime(10 * (events.length + 1));
    expect(seen).toEqual(events.map((e) => e.seq));
    expect(done).toBe(true);
  });

  it("should stop delivering after cancel (edge case)", () => {
    const events = mockRunEvents("r");
    const seen: number[] = [];
    const cancel = playMockStream(events, (e) => seen.push(e.seq), {
      intervalMs: 10,
    });
    vi.advanceTimersByTime(10);
    const countAfterOne = seen.length;
    cancel();
    vi.advanceTimersByTime(100);
    expect(seen.length).toBe(countAfterOne);
  });
});
