import { describe, it, expect } from "vitest";
import {
  deterministicVoiceJudge,
  deterministicQualityJudge,
  runJudge,
  type JudgeInput,
} from "../../src/checkpoints/judge.js";
import type { Persona, Webpage } from "@publisher/shared";

const persona: Persona = {
  id: "p_1",
  name: "Ada",
  voice: "precise, warm, technical",
  voiceSample:
    "We build the smallest thing that proves the idea, then we thicken it. Clarity over cleverness, always.",
  stylePoints: ["short sentences", "concrete examples", "no hype"],
  keyLearnings: ["ship the skeleton first"],
  designElements: { tone: "calm" },
};

function page(html: string, summary = "A page about building."): Webpage {
  return { title: "T", html, css: "", summary, sourcesUsed: [] };
}

describe("deterministicVoiceJudge", () => {
  it("should score on-voice text high when it echoes the voiceSample vocabulary", () => {
    const onVoice = page(
      "<main>We build the smallest thing that proves the idea, then we thicken it. Clarity over cleverness.</main>",
    );
    const score = deterministicVoiceJudge({ persona, webpage: onVoice });
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it("should score off-voice text low when it shares little vocabulary with the sample", () => {
    const offVoice = page(
      "<main>SYNERGY! Leverage disruptive paradigms to maximize stakeholder ROI across verticals!!!</main>",
    );
    const score = deterministicVoiceJudge({ persona, webpage: offVoice });
    expect(score).toBeLessThan(0.75);
  });

  it("should be deterministic — same input yields the same score (edge case)", () => {
    const p = page("<main>We build the smallest thing.</main>");
    const a = deterministicVoiceJudge({ persona, webpage: p });
    const b = deterministicVoiceJudge({ persona, webpage: p });
    expect(a).toBe(b);
  });

  it("should return 0 when there is no webpage to judge (edge case)", () => {
    expect(deterministicVoiceJudge({ persona })).toBe(0);
  });
});

describe("deterministicQualityJudge", () => {
  it("should score a substantial, well-summarized page high", () => {
    const good = page(
      "<main>" + "Real content with depth. ".repeat(30) + "</main>",
      "A clear, complete summary of the built page and what it covers.",
    );
    const score = deterministicQualityJudge({ persona, webpage: good });
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it("should score a thin, empty-summary page low", () => {
    const thin = page("<main>x</main>", "");
    const score = deterministicQualityJudge({ persona, webpage: thin });
    expect(score).toBeLessThan(0.75);
  });

  it("should return 0 with no webpage (edge case)", () => {
    expect(deterministicQualityJudge({ persona })).toBe(0);
  });
});

describe("runJudge (fail-closed)", () => {
  const input: JudgeInput = { persona, webpage: page("<main>ok</main>") };

  it("should return the judge score on success", async () => {
    const score = await runJudge(() => 0.9, input);
    expect(score.ok).toBe(true);
    expect(score.score).toBe(0.9);
    expect(score.error).toBeUndefined();
  });

  it("should fail closed (score 0, ok=false, captured error) when the judge throws", async () => {
    const score = await runJudge(() => {
      throw new Error("judge exploded");
    }, input);
    expect(score.ok).toBe(false);
    expect(score.score).toBe(0);
    expect(score.error).toContain("judge exploded");
  });

  it("should fail closed when an async judge rejects (edge case)", async () => {
    const score = await runJudge(
      () => Promise.reject(new Error("timeout")),
      input,
    );
    expect(score.ok).toBe(false);
    expect(score.score).toBe(0);
    expect(score.error).toContain("timeout");
  });

  it("should clamp out-of-range scores into [0,1]", async () => {
    expect((await runJudge(() => 1.7, input)).score).toBe(1);
    expect((await runJudge(() => -3, input)).score).toBe(0);
  });
});
