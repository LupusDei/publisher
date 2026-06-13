/**
 * Track G — Orchestrator (the spine, R2/R10). The real run loop replaces the
 * walking skeleton: research → compile → research-sufficiency → build → voice/
 * design/quality gates → bounded refine loop → escalate-or-publish, journaling
 * every transition (D5) and pausing for HITL (D19). The skeleton is retained
 * for its CI smoke role but the run service now drives `createRunEngine`.
 */
export {
  createRunEngine,
  MAX_ATTEMPTS,
  AgentFault,
  RunNotPausedError,
  type RunEngine,
  type RunEngineDeps,
  type StartInput,
  type RunOutcome,
} from "./run-engine.js";
export { createEventBus, type RunEventBus } from "./event-bus.js";
export { runSkeleton } from "./skeleton.js";
