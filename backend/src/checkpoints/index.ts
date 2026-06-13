import type { Checkpoint } from "../domain/index.js";
import { researchSufficiency } from "./research-sufficiency.js";
import { voiceFidelity } from "./voice-fidelity.js";
import {
  designConformance,
  type ValidatorsProvider,
} from "./design-conformance.js";
import { quality } from "./quality.js";
import type { Judge } from "./judge.js";

/**
 * Track D public surface — the Checkpoints pillar (Pillar 3).
 *
 * `createCheckpoints(deps)` assembles the FOUR ORDERED gates the orchestrator
 * runs each round, threading the injectable judge + validators provider through
 * the judge/validator gates. Defaults are fully offline/deterministic (the demo
 * + tests need no LLM and no Track B code); the orchestrator swaps in the real
 * LLM judge and Track B's compiled validators at integration time.
 */

export interface CheckpointDeps {
  /** Real or mock judge for the voice-fidelity gate (default: deterministic). */
  voiceJudge?: Judge;
  /** Real or mock judge for the quality gate (default: deterministic). */
  qualityJudge?: Judge;
  /** Supplies Track B's compiled detective validators (default: none/stub). */
  validators?: ValidatorsProvider;
  /** Optional threshold overrides (Wave 2 calibration). */
  voiceThreshold?: number;
  qualityThreshold?: number;
}

/** The four gates, in canonical evaluation order. */
export function createCheckpoints(deps: CheckpointDeps = {}): Checkpoint[] {
  return [
    researchSufficiency,
    voiceFidelity({ judge: deps.voiceJudge, threshold: deps.voiceThreshold }),
    designConformance({ validators: deps.validators }),
    quality({ judge: deps.qualityJudge, threshold: deps.qualityThreshold }),
  ];
}

export {
  researchSufficiency,
  RESEARCH_MIN_SOURCES,
} from "./research-sufficiency.js";
export {
  voiceFidelity,
  VOICE_THRESHOLD,
  type VoiceFidelityDeps,
} from "./voice-fidelity.js";
export {
  designConformance,
  type DesignConformanceDeps,
  type ValidatorsProvider,
} from "./design-conformance.js";
export { quality, QUALITY_THRESHOLD, type QualityDeps } from "./quality.js";
export { nextBuildFeedback } from "./next-build-feedback.js";
export {
  deterministicVoiceJudge,
  deterministicQualityJudge,
  runJudge,
  type Judge,
  type JudgeInput,
  type JudgeOutcome,
} from "./judge.js";
export {
  voiceDriftFixture,
  buildContext,
  type VoiceDriftFixture,
} from "./fixtures.js";
