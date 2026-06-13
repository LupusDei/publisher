import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Persona, Webpage } from "@publisher/shared";

// Mock the ai SDK so the real judge never hits the network. The judge uses
// generateObject (ai@6) to score voice fidelity; the mock returns a structured
// { score, rationale } object in the v6 shape. Each test overrides the impl.
const generateObject = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObject(...args),
  stepCountIs: vi.fn((n: number) => ({ __stepCountIs: n })),
}));
// The provider factory is constructed but never invoked under the mock.
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => vi.fn(() => ({ __model: true }))),
}));

import {
  createRealVoiceJudge,
  deterministicVoiceJudge,
  runJudge,
} from "../../src/checkpoints/judge.js";
import {
  selectVoiceJudge,
  voiceFidelity,
} from "../../src/checkpoints/voice-fidelity.js";
import { createCheckpoints } from "../../src/checkpoints/index.js";
import type { CheckpointContext } from "@publisher/shared";

const persona: Persona = {
  id: "p_1",
  name: "The Essayist",
  voice: "warm, plain",
  voiceSample: "Here's the idea, plainly. You already feel this. No jargon.",
  stylePoints: ["plain terms", "no jargon"],
  keyLearnings: [],
  designElements: {},
};

const webpage: Webpage = {
  title: "Here's the idea, plainly",
  html: "<main><h1>Here's the idea, plainly</h1><p>You already feel this.</p></main>",
  css: "",
  summary: "A warm, plain-spoken page.",
  sourcesUsed: [],
};

beforeEach(() => {
  generateObject.mockReset();
});

describe("createRealVoiceJudge (Claude-backed, ai SDK mocked)", () => {
  it("should map the model's structured score to a [0,1] number (happy path)", async () => {
    generateObject.mockResolvedValue({
      object: { score: 0.82, rationale: "on voice" },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      finishReason: "stop",
    });
    const judge = createRealVoiceJudge({ apiKey: "sk-x" });
    const score = await judge({ persona, webpage });
    expect(score).toBeCloseTo(0.82);
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it("should clamp an out-of-range model score into [0,1] via runJudge (edge case)", async () => {
    generateObject.mockResolvedValue({
      object: { score: 1.7, rationale: "over" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    });
    const judge = createRealVoiceJudge({ apiKey: "sk-x" });
    const outcome = await runJudge(judge, { persona, webpage });
    expect(outcome.ok).toBe(true);
    expect(outcome.score).toBe(1); // clamped
  });

  it("should fail closed when the model call throws (fault → not ok)", async () => {
    generateObject.mockRejectedValue(new Error("429 rate limited"));
    const judge = createRealVoiceJudge({ apiKey: "sk-x" });
    const outcome = await runJudge(judge, { persona, webpage });
    expect(outcome.ok).toBe(false);
    expect(outcome.score).toBe(0);
    expect(outcome.error).toMatch(/rate limited/i);
  });

  it("should score 0 with no model call when no webpage is provided (edge — nothing to score)", async () => {
    // Matches deterministicVoiceJudge: no page → 0 (a sub-threshold fail), not a
    // fault. The model is never called when there is nothing to judge.
    const judge = createRealVoiceJudge({ apiKey: "sk-x" });
    const outcome = await runJudge(judge, { persona });
    expect(outcome.ok).toBe(true);
    expect(outcome.score).toBe(0);
    expect(deterministicVoiceJudge({ persona })).toBe(0);
    expect(generateObject).not.toHaveBeenCalled();
  });
});

describe("selectVoiceJudge (mode-gated selection — rrt.4.1)", () => {
  it("should use the deterministic judge when real mode is OFF (offline/test path)", () => {
    const judge = selectVoiceJudge({ USE_REAL_AGENT: false, ANTHROPIC_API_KEY: "sk-x" });
    expect(judge).toBe(deterministicVoiceJudge);
  });

  it("should use the deterministic judge when real is requested but no key (edge)", () => {
    const judge = selectVoiceJudge({ USE_REAL_AGENT: true });
    expect(judge).toBe(deterministicVoiceJudge);
  });

  it("should use a real Claude judge when real mode is ON with a key (happy path)", async () => {
    generateObject.mockResolvedValue({
      object: { score: 0.9, rationale: "on voice" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    });
    const judge = selectVoiceJudge({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: "sk-x",
    });
    // Not the deterministic one, and it routes through the mocked model call.
    expect(judge).not.toBe(deterministicVoiceJudge);
    const score = await judge({ persona, webpage });
    expect(score).toBeCloseTo(0.9);
    expect(generateObject).toHaveBeenCalledTimes(1);
  });
});

describe("voice-fidelity gate wired to the real judge (rrt.4.1 wiring)", () => {
  const ctx: CheckpointContext = {
    persona,
    material: { concept: "On Emergence", persona },
    research: { text: "r", sources: [] },
    webpage,
    attempt: 1,
    priorResults: [],
  };

  it("should PASS the gate when the real judge scores above threshold (happy path)", async () => {
    generateObject.mockResolvedValue({
      object: { score: 0.95, rationale: "strongly on voice" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    });
    const gate = voiceFidelity({
      judge: selectVoiceJudge({ USE_REAL_AGENT: true, ANTHROPIC_API_KEY: "sk-x" }),
    });
    const result = await gate.evaluate(ctx);
    expect(result.passed).toBe(true);
    expect(result.score).toBeCloseTo(0.95);
  });

  it("should FAIL-CLOSED with a critical CHECKPOINT_ERROR when the real judge faults (fault path)", async () => {
    generateObject.mockRejectedValue(new Error("provider exploded"));
    const gate = voiceFidelity({
      judge: selectVoiceJudge({ USE_REAL_AGENT: true, ANTHROPIC_API_KEY: "sk-x" }),
    });
    const result = await gate.evaluate(ctx);
    expect(result.passed).toBe(false);
    expect(result.alarms[0]?.type).toBe("CHECKPOINT_ERROR");
    expect(result.alarms[0]?.severity).toBe("critical");
    expect(result.autoCorrectable).toBe(false);
  });

  it("should use the real judge when threaded through createCheckpoints (composition seam)", async () => {
    generateObject.mockResolvedValue({
      object: { score: 0.88, rationale: "on voice" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    });
    const voiceJudge = selectVoiceJudge({
      USE_REAL_AGENT: true,
      ANTHROPIC_API_KEY: "sk-x",
    });
    const gate = createCheckpoints({ voiceJudge }).find(
      (c) => c.name === "voice-fidelity",
    );
    expect(gate).toBeDefined();
    const result = await gate!.evaluate(ctx);
    expect(result.passed).toBe(true);
    expect(generateObject).toHaveBeenCalledTimes(1);
  });
});
