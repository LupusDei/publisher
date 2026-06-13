import { describe, it, expect } from "vitest";
import {
  AlarmSchema,
  type CheckpointResult,
  type MetricBreach,
} from "@publisher/shared";
import type { AgentError } from "../../src/domain/index.js";
import { createAlarmEmitter } from "../../src/observability/alarm-emitter.js";

const checkpoint = (
  over: Partial<CheckpointResult> & Pick<CheckpointResult, "name">,
): CheckpointResult => ({
  passed: false,
  score: 0.4,
  threshold: 0.7,
  details: "below threshold",
  autoCorrectable: true,
  alarms: [],
  ...over,
});

describe("createAlarmEmitter", () => {
  describe("MetricBreach → alarm", () => {
    it("should map a token breach to a TOKEN_BUDGET_EXCEEDED warning with context (D12, R5)", () => {
      const breach: MetricBreach = { kind: "token", observed: 700, limit: 500 };
      const [alarm] = createAlarmEmitter().evaluate(breach);
      expect(alarm.type).toBe("TOKEN_BUDGET_EXCEEDED");
      expect(alarm.severity).toBe("warning");
      expect(alarm.context).toMatchObject({ observed: 700, limit: 500 });
      expect(typeof alarm.recommendedAction).toBe("string");
      expect(alarm.recommendedAction.length).toBeGreaterThan(0);
      expect(() => AlarmSchema.parse(alarm)).not.toThrow();
    });

    it("should map a latency breach to a HIGH_LATENCY warning (R5)", () => {
      const breach: MetricBreach = {
        kind: "latency",
        phase: "build",
        observed: 1200,
        limit: 1000,
      };
      const [alarm] = createAlarmEmitter().evaluate(breach);
      expect(alarm.type).toBe("HIGH_LATENCY");
      expect(alarm.severity).toBe("warning");
      expect(alarm.context).toMatchObject({ phase: "build", observed: 1200, limit: 1000 });
    });
  });

  describe("CheckpointResult → alarm", () => {
    it("should return NO alarms for a passed checkpoint (happy path)", () => {
      const res = checkpoint({ name: "quality", passed: true });
      expect(createAlarmEmitter().evaluate(res)).toEqual([]);
    });

    it.each([
      ["research-sufficiency", "INSUFFICIENT_RESEARCH"],
      ["voice-fidelity", "VOICE_DRIFT"],
      ["design-conformance", "DESIGN_DRIFT"],
      ["quality", "INSUFFICIENT_QUALITY"],
    ] as const)(
      "should map failed %s checkpoint to %s alarm (R5)",
      (name, expectedType) => {
        const res = checkpoint({ name });
        const [alarm] = createAlarmEmitter().evaluate(res);
        expect(alarm.type).toBe(expectedType);
        expect(alarm.context).toMatchObject({ checkpoint: name });
        expect(() => AlarmSchema.parse(alarm)).not.toThrow();
      },
    );

    it("should mark an auto-correctable failure as warning and a non-correctable one as critical (severity, R5)", () => {
      const correctable = checkpoint({ name: "voice-fidelity", autoCorrectable: true });
      const hard = checkpoint({ name: "voice-fidelity", autoCorrectable: false });
      expect(createAlarmEmitter().evaluate(correctable)[0].severity).toBe("warning");
      expect(createAlarmEmitter().evaluate(hard)[0].severity).toBe("critical");
    });

    it("should carry score/threshold/feedback into the alarm context (edge case)", () => {
      const res = checkpoint({
        name: "quality",
        score: 0.55,
        threshold: 0.8,
        feedback: "tighten the intro",
      });
      const [alarm] = createAlarmEmitter().evaluate(res);
      expect(alarm.context).toMatchObject({ score: 0.55, threshold: 0.8 });
      expect(alarm.recommendedAction).toContain("tighten the intro");
    });
  });

  describe("AgentError → alarm", () => {
    it("should map a generic agent error to a PROVIDER_ERROR critical (error path, R5)", () => {
      const err: AgentError = { phase: "build", message: "connection reset" };
      const [alarm] = createAlarmEmitter().evaluate(err);
      expect(alarm.type).toBe("PROVIDER_ERROR");
      expect(alarm.severity).toBe("critical");
      expect(alarm.context).toMatchObject({ phase: "build", message: "connection reset" });
    });

    it.each([
      ["rate limit exceeded, retry after 30s", "RATE_LIMITED"],
      ["the model refused to answer", "REFUSAL"],
      ["output truncated: max length reached", "OUTPUT_TRUNCATED"],
      ["webpage generation failed: invalid html", "WEBPAGE_GENERATION_FAILED"],
    ] as const)(
      "should classify agent error message %j as %s (R5)",
      (message, expectedType) => {
        const [alarm] = createAlarmEmitter().evaluate({ phase: "build", message });
        expect(alarm.type).toBe(expectedType);
        expect(() => AlarmSchema.parse(alarm)).not.toThrow();
      },
    );

    it("should never throw — alarms are returned (D7)", () => {
      const emitter = createAlarmEmitter();
      expect(() =>
        emitter.evaluate({ phase: "research", message: "boom" }),
      ).not.toThrow();
    });
  });

  it("should expose the declared budget when constructed with one", () => {
    const emitter = createAlarmEmitter({ maxTokens: 500 });
    expect(emitter.budget).toEqual({ maxTokens: 500 });
  });
});
