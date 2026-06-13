import { describe, it, expect } from "vitest";
import type { CheckpointResult } from "@publisher/shared";
import { nextBuildFeedback } from "../../src/checkpoints/next-build-feedback.js";

function res(over: Partial<CheckpointResult>): CheckpointResult {
  return {
    name: "voice-fidelity",
    passed: true,
    details: "",
    autoCorrectable: true,
    alarms: [],
    ...over,
  };
}

describe("nextBuildFeedback", () => {
  it("should return empty string when every gate passed (happy path)", () => {
    const out = nextBuildFeedback([
      res({ name: "voice-fidelity", passed: true }),
      res({ name: "quality", passed: true }),
    ]);
    expect(out).toBe("");
  });

  it("should compose feedback only from FAILED gates that carry feedback", () => {
    const out = nextBuildFeedback([
      res({
        name: "voice-fidelity",
        passed: false,
        feedback: "Match the voice.",
      }),
      res({ name: "quality", passed: true, feedback: "ignored (passed)" }),
      res({
        name: "design-conformance",
        passed: false,
        feedback: "Fix palette.",
      }),
    ]);
    expect(out).toContain("Match the voice.");
    expect(out).toContain("Fix palette.");
    expect(out).not.toContain("ignored");
  });

  it("should label each piece of feedback with its gate name for the worker", () => {
    const out = nextBuildFeedback([
      res({
        name: "voice-fidelity",
        passed: false,
        feedback: "Match the voice.",
      }),
    ]);
    expect(out).toContain("voice-fidelity");
  });

  it("should skip failed gates that have no feedback (edge case)", () => {
    const out = nextBuildFeedback([
      res({ name: "quality", passed: false, feedback: undefined }),
    ]);
    expect(out).toBe("");
  });

  it("should return empty string for an empty results array (edge case)", () => {
    expect(nextBuildFeedback([])).toBe("");
  });

  it("should preserve gate order in the composed output", () => {
    const out = nextBuildFeedback([
      res({ name: "voice-fidelity", passed: false, feedback: "FIRST" }),
      res({ name: "quality", passed: false, feedback: "SECOND" }),
    ]);
    expect(out.indexOf("FIRST")).toBeLessThan(out.indexOf("SECOND"));
  });
});
