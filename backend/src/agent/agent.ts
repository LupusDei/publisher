import type { AgentResult, ResearchResult, Webpage } from "@publisher/shared";

/**
 * The single Agent seam (RECONCILED — ASSUMPTIONS D2). The orchestrator only
 * ever talks to this interface — never to the pillars and never to a concrete
 * provider. The agent receives a COMPILED `system: string` (produced by the
 * Guardrails pillar), never a `Persona` — a pillar must not live inside the
 * worker. Every call returns `AgentResult<T>` so `usage`/`finishReason` ride
 * through for Observability (Pillar 4) and the error alarms.
 *
 * `ResearchResult` now lives in `@publisher/shared` (it crosses the seam AND
 * feeds CheckpointContext); re-exported here for callers that import from agent/.
 */
export type { ResearchResult } from "@publisher/shared";

export interface Agent {
  /** RESEARCH phase: gather credible depth on a concept, under the compiled system. */
  research(input: {
    system: string;
    concept: string;
  }): Promise<AgentResult<ResearchResult>>;
  /** BUILD/REFINE phase: produce a typed webpage; `feedback` drives a refine pass. */
  build(input: {
    system: string;
    research: ResearchResult;
    feedback?: string;
  }): Promise<AgentResult<Webpage>>;
}
