import type { RunStatus } from "@publisher/shared";
import type { RunStore } from "../stores/run.store.js";

/**
 * The active, engine-driven statuses. A run in one of these has (or had) a live
 * engine loop. Because the engine is in-memory and fire-and-forget, after a
 * process restart NONE of these are actually running anymore — they're orphaned.
 */
const ACTIVE_STATUSES: readonly RunStatus[] = [
  "researching",
  "building",
  "checking",
  "refining",
];

/**
 * Boot reconcile (publisher-kgv). On startup the engine's in-memory state is
 * empty, so any run still marked with an active status was abandoned by whatever
 * process died. Flip those to `interrupted` so they read as RESUMABLE in the UI
 * instead of spinning on "researching…" forever. Returns the ids it marked.
 *
 * Paused (escalated / awaiting_approval) and terminal (published / failed) runs
 * are left untouched — they're already in a coherent, durable state.
 */
export function reconcileInterruptedRuns(runStore: RunStore): string[] {
  const orphaned = runStore
    .list()
    .filter((run) => ACTIVE_STATUSES.includes(run.status));
  for (const run of orphaned) {
    runStore.updateStatus(run.id, "interrupted");
  }
  return orphaned.map((run) => run.id);
}
