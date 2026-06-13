import { describe, it, expect } from "vitest";
import { AlarmSchema, type FinishReason } from "@publisher/shared";
import {
  finishReasonToAlarm,
  errorToAlarm,
  AgentError,
} from "../../src/agent/alarm-mapping.js";

describe("finishReasonToAlarm", () => {
  it("should return null for a clean stop (no alarm)", () => {
    expect(finishReasonToAlarm("stop", { phase: "build" })).toBeNull();
  });

  it("should map 'refusal' to a critical REFUSAL alarm", () => {
    const alarm = finishReasonToAlarm("refusal", { phase: "build" });
    expect(alarm).not.toBeNull();
    expect(alarm?.type).toBe("REFUSAL");
    expect(alarm?.severity).toBe("critical");
    expect(() => AlarmSchema.parse(alarm)).not.toThrow();
  });

  it("should map 'content-filter' to a critical REFUSAL alarm", () => {
    const alarm = finishReasonToAlarm("content-filter", { phase: "research" });
    expect(alarm?.type).toBe("REFUSAL");
    expect(alarm?.severity).toBe("critical");
  });

  it("should map 'length' to a warning OUTPUT_TRUNCATED alarm", () => {
    const alarm = finishReasonToAlarm("length", { phase: "build" });
    expect(alarm?.type).toBe("OUTPUT_TRUNCATED");
    expect(alarm?.severity).toBe("warning");
    expect(alarm?.context["phase"]).toBe("build");
  });

  it("should map 'error' to a critical PROVIDER_ERROR alarm", () => {
    const alarm = finishReasonToAlarm("error", { phase: "build" });
    expect(alarm?.type).toBe("PROVIDER_ERROR");
    expect(alarm?.severity).toBe("critical");
  });

  it("should return null for 'tool-calls' and 'other' (not alarm-worthy)", () => {
    expect(finishReasonToAlarm("tool-calls", { phase: "research" })).toBeNull();
    expect(finishReasonToAlarm("other", { phase: "build" })).toBeNull();
  });

  it("should carry phase + workerId into the alarm context when provided", () => {
    const alarm = finishReasonToAlarm("refusal", {
      phase: "build",
      workerId: "opus",
    });
    expect(alarm?.context["phase"]).toBe("build");
    expect(alarm?.context["workerId"]).toBe("opus");
    expect(typeof alarm?.recommendedAction).toBe("string");
  });

  it("should produce a schema-valid alarm for every alarm-worthy finishReason", () => {
    const reasons: FinishReason[] = [
      "refusal",
      "content-filter",
      "length",
      "error",
    ];
    for (const r of reasons) {
      const alarm = finishReasonToAlarm(r, { phase: "build" });
      expect(() => AlarmSchema.parse(alarm)).not.toThrow();
    }
  });
});

describe("errorToAlarm", () => {
  it("should map a rate-limit error to a critical RATE_LIMITED alarm", () => {
    const alarm = errorToAlarm(new AgentError("429 Too Many Requests", 429), {
      phase: "build",
    });
    expect(alarm.type).toBe("RATE_LIMITED");
    expect(alarm.severity).toBe("critical");
    expect(() => AlarmSchema.parse(alarm)).not.toThrow();
  });

  it("should detect a rate limit from the message when no status code", () => {
    const alarm = errorToAlarm(new Error("Rate limit exceeded, retry later"), {
      phase: "research",
    });
    expect(alarm.type).toBe("RATE_LIMITED");
  });

  it("should map a generic thrown error to a critical PROVIDER_ERROR alarm", () => {
    const alarm = errorToAlarm(new Error("socket hang up"), { phase: "build" });
    expect(alarm.type).toBe("PROVIDER_ERROR");
    expect(alarm.severity).toBe("critical");
    expect(alarm.context["message"]).toContain("socket hang up");
  });

  it("should map a 5xx status error to PROVIDER_ERROR", () => {
    const alarm = errorToAlarm(new AgentError("Internal Server Error", 503), {
      phase: "build",
    });
    expect(alarm.type).toBe("PROVIDER_ERROR");
  });

  it("should handle a non-Error thrown value gracefully", () => {
    const alarm = errorToAlarm("a bare string failure", { phase: "build" });
    expect(alarm.type).toBe("PROVIDER_ERROR");
    expect(alarm.context["message"]).toContain("a bare string failure");
    expect(() => AlarmSchema.parse(alarm)).not.toThrow();
  });

  it("should carry workerId into the alarm context when provided", () => {
    const alarm = errorToAlarm(new Error("boom"), {
      phase: "build",
      workerId: "sonnet",
    });
    expect(alarm.context["workerId"]).toBe("sonnet");
  });
});
