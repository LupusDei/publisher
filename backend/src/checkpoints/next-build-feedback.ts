import type { CheckpointResult } from "@publisher/shared";

/**
 * Compose the refine feedback string for the next BUILD attempt from a round's
 * checkpoint results. OWNED HERE (ASSUMPTIONS D8 / dp0.8), NOT in the
 * orchestrator — the spine stays a thin sequencer; the domain logic of "what to
 * tell the worker next" lives with the checkpoints.
 *
 * Pure function: failed gates that carry `feedback` are concatenated, in order,
 * each labeled with its gate name so the worker knows which constraint to fix.
 * Returns "" when nothing failed (the caller publishes instead of refining).
 */
export function nextBuildFeedback(results: CheckpointResult[]): string {
  return results
    .filter((r) => !r.passed && r.feedback && r.feedback.trim().length > 0)
    .map((r) => `- [${r.name}] ${r.feedback}`)
    .join("\n");
}
