import type {
  Alarm,
  Checkpoint,
  CheckpointContext,
  CheckpointResult,
} from "@publisher/shared";
import { deterministicVoiceJudge, runJudge, type Judge } from "./judge.js";

/**
 * Gate 2 — VOICE FIDELITY (judge). Measures the built page against the persona's
 * voice profile + `voiceSample`. The judge is INJECTABLE (dp0.5.2): the default
 * is the deterministic offline judge so tests/demo never depend on a live LLM;
 * the real LLM judge is passed in later via deps. The R2 money shot lives here —
 * attempt-1 (off-voice) FAILS, attempt-2 (on-voice, post-feedback) PASSES.
 *
 * FAIL-CLOSED (dp0.5.2): if the judge throws, we emit a critical CHECKPOINT_ERROR
 * alarm and FAIL the gate — a faulting judge never passes (never fail-open).
 */

/** Explicit threshold: a page scoring below this is off-voice and rejected. */
export const VOICE_THRESHOLD = 0.75;

export interface VoiceFidelityDeps {
  /** Injectable judge; defaults to the deterministic offline judge. */
  judge?: Judge;
  /** Override the pass threshold (calibration in Wave 2). */
  threshold?: number;
}

export function voiceFidelity(deps: VoiceFidelityDeps = {}): Checkpoint {
  const judge = deps.judge ?? deterministicVoiceJudge;
  const threshold = deps.threshold ?? VOICE_THRESHOLD;

  return {
    name: "voice-fidelity",
    kind: "judge",
    async evaluate(ctx: CheckpointContext): Promise<CheckpointResult> {
      const outcome = await runJudge(judge, {
        persona: ctx.persona,
        webpage: ctx.webpage,
      });

      // Fail-closed: a judge fault is a critical CHECKPOINT_ERROR + FAIL.
      if (!outcome.ok) {
        const alarm: Alarm = {
          type: "CHECKPOINT_ERROR",
          severity: "critical",
          context: { checkpoint: "voice-fidelity", error: outcome.error ?? "" },
          recommendedAction:
            "The voice judge failed to run; treat as a fail and escalate for human review.",
        };
        return {
          name: "voice-fidelity",
          passed: false,
          score: 0,
          threshold,
          details: `Voice judge errored: ${outcome.error ?? "unknown"} — failing closed.`,
          autoCorrectable: false,
          feedback:
            "The voice check could not be evaluated. Do not publish; escalate.",
          alarms: [alarm],
        };
      }

      const passed = outcome.score >= threshold;
      if (passed) {
        return {
          name: "voice-fidelity",
          passed: true,
          score: outcome.score,
          threshold,
          details: `On voice: ${outcome.score.toFixed(2)} >= ${threshold}.`,
          autoCorrectable: true,
          alarms: [],
        };
      }

      const alarm: Alarm = {
        type: "VOICE_DRIFT",
        severity: "warning",
        context: { score: outcome.score, threshold, persona: ctx.persona.name },
        recommendedAction:
          "Redraft closer to the persona's voiceSample; tighten tone and diction.",
      };
      return {
        name: "voice-fidelity",
        passed: false,
        score: outcome.score,
        threshold,
        details: `Voice drift: ${outcome.score.toFixed(2)} < ${threshold}.`,
        autoCorrectable: true,
        feedback: `The draft reads off-voice for ${ctx.persona.name} (scored ${outcome.score.toFixed(
          2,
        )}, need ${threshold}). Rewrite to match the voice sample: "${ctx.persona.voiceSample}". Style: ${ctx.persona.stylePoints.join(
          "; ",
        )}.`,
        alarms: [alarm],
      };
    },
  };
}
