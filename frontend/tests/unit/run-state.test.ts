import { describe, it, expect } from "vitest";
import type { RunEvent } from "@publisher/shared";
import {
  applyEvent,
  applyEvents,
  emptyRunView,
  totalTokens,
  totalLatencyMs,
  isTerminal,
  PILLARS,
} from "@/app/runs/run-state";
import {
  mockRunEvents,
  mockEscalationEvents,
  mockFailureEvents,
} from "@/app/runs/mock-stream";

function env(seq: number, t = "ts"): { runId: string; seq: number; ts: string } {
  return { runId: "r", seq, ts: t };
}

describe("run-state reducer", () => {
  it("should start empty with status created and no lanes/drafts (initial state)", () => {
    const v = emptyRunView("r");
    expect(v.status).toBe("created");
    expect(v.lastSeq).toBe(-1);
    expect(v.drafts).toHaveLength(0);
    expect(v.alarms).toHaveLength(0);
    for (const p of PILLARS) expect(v.lanes[p]).toHaveLength(0);
  });

  it("should fold a phase event into status + phase (state change)", () => {
    const e: RunEvent = { ...env(0), t: "phase", phase: "research" };
    const v = applyEvent(emptyRunView("r"), e);
    expect(v.status).toBe("researching");
    expect(v.phase).toBe("research");
    expect(v.lastSeq).toBe(0);
  });

  it("should bucket a pillar-tagged event onto its lane and untagged onto spine", () => {
    const tagged: RunEvent = {
      ...env(0),
      pillar: "observability",
      t: "metric",
      metrics: {
        perPhase: {
          research: { tokens: 1, latencyMs: 1, calls: 1 },
          build: { tokens: 0, latencyMs: 0, calls: 0 },
          refine: { tokens: 0, latencyMs: 0, calls: 0 },
        },
        errorRate: 0,
      },
    };
    const untagged: RunEvent = { ...env(1), t: "phase", phase: "build" };
    let v = applyEvent(emptyRunView("r"), tagged);
    v = applyEvent(v, untagged);
    expect(v.lanes.observability).toHaveLength(1);
    expect(v.spine).toHaveLength(1);
  });

  it("should ignore an already-seen or out-of-order event (idempotency edge case)", () => {
    const e0: RunEvent = { ...env(0), t: "phase", phase: "research" };
    const e1: RunEvent = { ...env(1), t: "phase", phase: "build" };
    let v = applyEvent(emptyRunView("r"), e0);
    v = applyEvent(v, e1);
    // Re-delivering seq 0 and 1 (reconnect overlap) must not double-fold.
    const before = v;
    v = applyEvent(v, e0);
    v = applyEvent(v, e1);
    expect(v).toBe(before);
    expect(v.spine).toHaveLength(2);
  });

  it("should retain every draft attempt in order (R2 timeline)", () => {
    const events = mockRunEvents("r");
    const v = applyEvents(emptyRunView("r"), events);
    expect(v.drafts.map((d) => d.attempt)).toEqual([1, 2]);
    expect(v.drafts[0]?.score).toBe(0.42);
    expect(v.drafts[0]?.passed).toBe(false);
    expect(v.drafts[1]?.score).toBe(0.81);
    expect(v.drafts[1]?.passed).toBe(true);
  });

  it("should attach the failing-checkpoint feedback to the draft that produced the redraft (R2 narrative)", () => {
    const v = applyEvents(emptyRunView("r"), mockRunEvents("r"));
    // Draft 1 failed voice-fidelity → its feedbackToNext is the redraft cause.
    expect(v.drafts[0]?.feedbackToNext).toMatch(/voiceSample|colloquialisms/i);
    // Draft 2 passed → no feedbackToNext.
    expect(v.drafts[1]?.feedbackToNext).toBeUndefined();
  });

  it("should collect alarms and the latest metrics snapshot", () => {
    const v = applyEvents(emptyRunView("r"), mockRunEvents("r"));
    expect(v.alarms.some((a) => a.type === "VOICE_DRIFT")).toBe(true);
    expect(totalTokens(v.metrics)).toBe(1200 + 2100 + 1800);
    expect(totalLatencyMs(v.metrics)).toBeGreaterThan(0);
  });

  it("should reach published with a receipt on the happy path (terminal)", () => {
    const v = applyEvents(emptyRunView("r"), mockRunEvents("r"));
    expect(v.status).toBe("published");
    expect(v.receipt?.url).toContain("/published/");
    expect(isTerminal(v.status)).toBe(true);
  });

  it("should surface a pending escalation and clear it on resume (R10)", () => {
    let v = applyEvents(emptyRunView("r"), mockEscalationEvents("r"));
    expect(v.status).toBe("escalated");
    expect(v.escalation?.id).toBe("esc_1");
    // A resumed event clears the pending escalation.
    const resumed: RunEvent = {
      ...env(v.lastSeq + 1),
      t: "resumed",
      decision: { escalationId: "esc_1", choice: "approve_anyway" },
    };
    v = applyEvent(v, resumed);
    expect(v.escalation).toBeUndefined();
    expect(v.lastDecision?.choice).toBe("approve_anyway");
  });

  it("should fold an AWAITING_APPROVAL escalation into awaiting_approval, not escalated (final HITL gate)", () => {
    const esc: RunEvent = {
      ...env(0),
      pillar: "observability",
      t: "escalation",
      escalation: {
        id: "esc_approve",
        runId: "r",
        reason: "Draft ready to publish.",
        alarm: {
          type: "AWAITING_APPROVAL",
          severity: "info",
          context: {},
          recommendedAction: "Approve to publish.",
        },
        options: ["approve_anyway", "enrich_persona", "abort"],
      },
    };
    const v = applyEvent(emptyRunView("r"), esc);
    expect(v.status).toBe("awaiting_approval");
    expect(v.escalation?.id).toBe("esc_approve");
    // Not terminal — it is paused awaiting the human.
    expect(isTerminal(v.status)).toBe(false);
  });

  it("should reach failed with a reason on a terminal failure (refused to publish)", () => {
    const v = applyEvents(emptyRunView("r"), mockFailureEvents("r"));
    expect(v.status).toBe("failed");
    expect(v.failureReason).toMatch(/Refused to publish/);
    expect(isTerminal(v.status)).toBe(true);
  });

  it("should report zero tokens/latency when no metrics have arrived (edge case)", () => {
    expect(totalTokens(undefined)).toBe(0);
    expect(totalLatencyMs(undefined)).toBe(0);
  });
});
