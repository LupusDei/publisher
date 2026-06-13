import { describe, it, expect } from "vitest";
import {
  voiceDriftFixture,
  buildContext,
} from "../../src/checkpoints/fixtures.js";
import { voiceFidelity } from "../../src/checkpoints/voice-fidelity.js";

/**
 * The D12 deterministic R2 fixture: attempt-1 (off-voice) FAILS voice-fidelity,
 * attempt-2 (on-voice, post-feedback) PASSES — using the DEFAULT deterministic
 * judge (no LLM). Pairs with Track C's scripted MockAgent for the demo.
 */
describe("voiceDriftFixture (D12 — R2 money shot)", () => {
  const gate = voiceFidelity();

  it("attempt-1 off-voice draft FAILS voice-fidelity with VOICE_DRIFT", async () => {
    const ctx = buildContext(voiceDriftFixture, voiceDriftFixture.attempt1, 1);
    const r = await gate.evaluate(ctx);
    expect(r.passed).toBe(false);
    expect(r.alarms.map((a) => a.type)).toContain("VOICE_DRIFT");
    expect(r.feedback).toBeTruthy();
  });

  it("attempt-2 on-voice draft PASSES voice-fidelity", async () => {
    const ctx = buildContext(voiceDriftFixture, voiceDriftFixture.attempt2, 2);
    const r = await gate.evaluate(ctx);
    expect(r.passed).toBe(true);
    expect(r.score ?? 0).toBeGreaterThanOrEqual(r.threshold ?? 1);
  });

  it("the two attempts produce a visible before/after score jump (R2 diff)", async () => {
    const a1 = await gate.evaluate(
      buildContext(voiceDriftFixture, voiceDriftFixture.attempt1, 1),
    );
    const a2 = await gate.evaluate(
      buildContext(voiceDriftFixture, voiceDriftFixture.attempt2, 2),
    );
    expect((a2.score ?? 0) - (a1.score ?? 0)).toBeGreaterThan(0.2);
  });

  it("is deterministic across runs (edge case)", async () => {
    const first = await gate.evaluate(
      buildContext(voiceDriftFixture, voiceDriftFixture.attempt1, 1),
    );
    const second = await gate.evaluate(
      buildContext(voiceDriftFixture, voiceDriftFixture.attempt1, 1),
    );
    expect(first.score).toBe(second.score);
  });
});
