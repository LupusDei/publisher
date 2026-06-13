import type {
  Alarm,
  CheckpointContext,
  CheckpointResult,
} from "@publisher/shared";
import type { Checkpoint } from "../domain/index.js";

/**
 * Gate 1 — RESEARCH SUFFICIENCY (deterministic). The first ordered checkpoint:
 * before we let the worker build, the research must clear an explicit, hard bar.
 * Deterministic (no judge) — a gate the demo can rely on to either pass or fail
 * the same way every time (R4: explicit pass/fail + score + threshold).
 *
 * Threshold: at least RESEARCH_MIN_SOURCES distinct sources. Empty research is a
 * hard fail and is NOT auto-correctable by a refine pass (you can't refine your
 * way to more sources — you must re-research / enrich), which the orchestrator
 * reads off `autoCorrectable` to decide loop vs. escalate.
 */

/** Explicit threshold: minimum distinct credible sources to proceed to build. */
export const RESEARCH_MIN_SOURCES = 3;

function distinctSources(sources: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sources) {
    const k = s.trim();
    if (k.length === 0 || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export const researchSufficiency: Checkpoint = {
  name: "research-sufficiency",
  kind: "deterministic",
  async evaluate(ctx: CheckpointContext): Promise<CheckpointResult> {
    const sources = distinctSources(ctx.research.sources);
    const count = sources.length;
    const passed = count >= RESEARCH_MIN_SOURCES;

    if (passed) {
      return {
        name: "research-sufficiency",
        passed: true,
        score: count,
        threshold: RESEARCH_MIN_SOURCES,
        details: `Research cleared the bar: ${count} distinct sources (>= ${RESEARCH_MIN_SOURCES}).`,
        autoCorrectable: false,
        alarms: [],
      };
    }

    const alarm: Alarm = {
      type: "INSUFFICIENT_RESEARCH",
      severity: "warning",
      context: { sources: count, threshold: RESEARCH_MIN_SOURCES },
      recommendedAction:
        "Gather more credible sources before building — re-run research or enrich the concept.",
    };

    return {
      name: "research-sufficiency",
      passed: false,
      score: count,
      threshold: RESEARCH_MIN_SOURCES,
      details: `Insufficient research: ${count} distinct source(s), need >= ${RESEARCH_MIN_SOURCES}.`,
      // Not fixable by a refine of the SAME research — re-research / enrich needed.
      autoCorrectable: false,
      feedback: `Research is too thin (${count}/${RESEARCH_MIN_SOURCES} sources). Broaden the research before drafting.`,
      alarms: [alarm],
    };
  },
};
