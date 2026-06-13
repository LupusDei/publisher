import type { Agent } from "./agent.js";
import { MockAgent } from "./mock-agent.js";
import { AnthropicAgent } from "./anthropic-agent.js";
import { resolveWorker, DEFAULT_WORKER_ID } from "./workers.js";

export { type Agent, type ResearchResult } from "./agent.js";
export { MockAgent } from "./mock-agent.js";
export { AnthropicAgent } from "./anthropic-agent.js";
export {
  AVAILABLE_WORKERS,
  DEFAULT_WORKER_ID,
  resolveWorker,
  type WorkerDescriptor,
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
  /** Optional worker id (e.g. "opus" | "sonnet"); unknown ids fall back. */
  workerId?: string | undefined;
}

/**
 * Select the worker. Defaults to the token-free MockAgent; only returns the
 * real Anthropic agent when explicitly enabled AND a key is present. When real,
 * `workerId` selects among `AVAILABLE_WORKERS` (R11) behind the same interface;
 * an unknown id degrades to the default worker. This is the one place the worker
 * is chosen — the orchestrator stays provider-blind.
 *
 * NOTE: the `createAgent` export is consumed by `server.ts`; its name and the
 * MockAgent default are kept stable. `workerId` is purely additive.
 */
export function createAgent(env: AgentSelection): Agent {
  if (env.USE_REAL_AGENT && env.ANTHROPIC_API_KEY) {
    const worker = resolveWorker(env.workerId ?? DEFAULT_WORKER_ID);
    return new AnthropicAgent({
      apiKey: env.ANTHROPIC_API_KEY,
      model: worker.model,
      workerId: worker.id,
    });
  }
  return new MockAgent();
}
