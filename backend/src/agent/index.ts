import type { Agent } from "./agent.js";
import { MockAgent } from "./mock-agent.js";
import { AnthropicAgent, GatewayAgent } from "./anthropic-agent.js";
import { AnthropicResearchAgent } from "./anthropic-research-agent.js";
import { resolveWorker, DEFAULT_WORKER_ID } from "./workers.js";

export { type Agent, type ResearchResult } from "./agent.js";
export { MockAgent } from "./mock-agent.js";
export { AnthropicAgent, GatewayAgent } from "./anthropic-agent.js";
export { AnthropicResearchAgent } from "./anthropic-research-agent.js";
export {
  AVAILABLE_WORKERS,
  BUILDER_WORKERS,
  DEFAULT_WORKER_ID,
  RESEARCH_WORKER_ID,
  resolveWorker,
  type WorkerDescriptor,
  type WorkerImpl,
} from "./workers.js";
export {
  finishReasonToAlarm,
  errorToAlarm,
  AgentError,
  type AgentAlarmContext,
} from "./alarm-mapping.js";

/**
 * Inputs to worker selection. `workerId` picks among the real workers (R11) —
 * the one-line swap behind the SAME `Agent` interface. When the real agent is
 * off (or no key), the token-free MockAgent is returned regardless.
 */
export interface AgentSelection {
  USE_REAL_AGENT: boolean;
  ANTHROPIC_API_KEY?: string | undefined;
  /** Vercel AI Gateway key — required only for `gateway`-impl workers (one key,
   * every provider). Anthropic-backed workers ignore it. */
  AI_GATEWAY_API_KEY?: string | undefined;
  /**
   * Optional worker id (e.g. "opus" | "sonnet" | "gpt5" | "anthropic-research");
   * unknown ids fall back to the default worker.
   */
  workerId?: string | undefined;
}

/**
 * Select the worker. Defaults to the token-free MockAgent; only returns a real
 * worker when explicitly enabled AND a key is present. When real, `workerId`
 * selects among `AVAILABLE_WORKERS` (R11) behind the same `Agent` interface and
 * the descriptor's `impl` decides which concrete implementation is built:
 *   - `vercel-ai-sdk`      → `AnthropicAgent`  (direct Anthropic; ANTHROPIC_API_KEY)
 *   - `gateway`           → `GatewayAgent`    (any provider via the Vercel AI
 *                            Gateway; AI_GATEWAY_API_KEY)
 *   - `anthropic-research` → `AnthropicResearchAgent` (real `web_search`, D13)
 * Each impl needs only ITS OWN key — a gateway worker runs with just the gateway
 * key, an Anthropic worker with just the Anthropic key. When the required key is
 * missing (or USE_REAL_AGENT is off) the token-free MockAgent is returned, so a
 * stray pick can never throw. This is the one place the worker is chosen — the
 * orchestrator stays provider-blind.
 */
export function createAgent(env: AgentSelection): Agent {
  if (!env.USE_REAL_AGENT) return new MockAgent();
  const worker = resolveWorker(env.workerId ?? DEFAULT_WORKER_ID);

  // Gateway-backed workers authenticate with the single AI Gateway key.
  if (worker.impl === "gateway") {
    if (!env.AI_GATEWAY_API_KEY) return new MockAgent();
    return new GatewayAgent({
      apiKey: env.AI_GATEWAY_API_KEY,
      model: worker.model,
      workerId: worker.id,
    });
  }

  // Anthropic-backed workers (direct build + the web-research worker).
  if (!env.ANTHROPIC_API_KEY) return new MockAgent();
  if (worker.impl === "anthropic-research") {
    return new AnthropicResearchAgent({
      apiKey: env.ANTHROPIC_API_KEY,
      model: worker.model,
      workerId: worker.id,
    });
  }
  return new AnthropicAgent({
    apiKey: env.ANTHROPIC_API_KEY,
    model: worker.model,
    workerId: worker.id,
  });
}

/**
 * PER-RUN worker selection (rrt.2.1). Same env-gating and worker resolution as
 * `createAgent`, but the run's `workerId` is the FIRST-CLASS input — this is the
 * factory the composition root threads into the orchestrator so that each run
 * builds the agent for ITS OWN `workerId` (the R11 swap stops being cosmetic).
 * Real mode off / no key → token-free MockAgent regardless of `workerId`; an
 * unknown id quietly degrades to the default worker (never throws).
 *
 * Kept as a thin alias of `createAgent` so there is exactly ONE place that maps
 * a workerId to a concrete Agent + model — the orchestrator stays provider-blind
 * and only ever sees the `Agent` seam.
 */
export type AgentFactory = (workerId: string | undefined) => Agent;

export function createAgentForWorker(env: AgentSelection): Agent {
  return createAgent(env);
}
