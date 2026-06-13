import type {
  Alarm,
  CheckpointContext,
  CheckpointResult,
} from "@publisher/shared";
import type { Checkpoint } from "../domain/index.js";
import { deterministicQualityJudge, runJudge, type Judge } from "./judge.js";

/**
 * Gate 4 — QUALITY (judge). The final gate: is the built page actually good
 * enough to publish? Judge-driven with an INJECTABLE judge (default = the
 * deterministic offline judge). FAIL-CLOSED on judge error (critical
 * CHECKPOINT_ERROR + FAIL), same contract as voice-fidelity (dp0.5.2).
 */

/** Explicit threshold: pages scoring below this are not publish-worthy. */
export const QUALITY_THRESHOLD = 0.75;

export interface QualityDeps {
  /** Injectable judge; defaults to the deterministic offline judge. */
  judge?: Judge | undefined;
  /** Override the pass threshold (calibration in Wave 2). */
  threshold?: number | undefined;
}

export function quality(deps: QualityDeps = {}): Checkpoint {
  const judge = deps.judge ?? deterministicQualityJudge;
  const threshold = deps.threshold ?? QUALITY_THRESHOLD;

  return {
    name: "quality",
    kind: "judge",
    async evaluate(ctx: CheckpointContext): Promise<CheckpointResult> {
      const outcome = await runJudge(judge, {
        persona: ctx.persona,
        webpage: ctx.webpage,
      });

      if (!outcome.ok) {
        const alarm: Alarm = {
          type: "CHECKPOINT_ERROR",
          severity: "critical",
          context: { checkpoint: "quality", error: outcome.error ?? "" },
          recommendedAction:
            "The quality judge failed to run; treat as a fail and escalate for human review.",
        };
        return {
          name: "quality",
          passed: false,
          score: 0,
          threshold,
          details: `Quality judge errored: ${outcome.error ?? "unknown"} — failing closed.`,
          autoCorrectable: false,
          feedback:
            "The quality check could not be evaluated. Do not publish; escalate.",
          alarms: [alarm],
        };
      }

      const passed = outcome.score >= threshold;
      if (passed) {
        return {
          name: "quality",
          passed: true,
          score: outcome.score,
          threshold,
          details: `Quality cleared: ${outcome.score.toFixed(2)} >= ${threshold}.`,
          autoCorrectable: true,
          alarms: [],
        };
      }

      const alarm: Alarm = {
        type: "INSUFFICIENT_QUALITY",
        severity: "warning",
        context: { score: outcome.score, threshold },
        recommendedAction:
          "Redraft with more substance, structure, and a complete summary.",
      };
      return {
        name: "quality",
        passed: false,
        score: outcome.score,
        threshold,
        details: `Quality below bar: ${outcome.score.toFixed(2)} < ${threshold}.`,
        autoCorrectable: true,
        feedback: `The draft isn't publish-quality yet (scored ${outcome.score.toFixed(
          2,
        )}, need ${threshold}). Add depth and a complete summary.`,
        alarms: [alarm],
      };
    },
  };
}
