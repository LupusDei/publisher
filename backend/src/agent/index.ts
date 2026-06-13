import type { Agent } from "./agent.js";
import { MockAgent } from "./mock-agent.js";
import { AnthropicAgent } from "./anthropic-agent.js";

export { type Agent, type ResearchResult } from "./agent.js";
export { MockAgent } from "./mock-agent.js";
export { AnthropicAgent } from "./anthropic-agent.js";

export interface AgentSelection {
  USE_REAL_AGENT: boolean;
  ANTHROPIC_API_KEY?: string | undefined;
}

/**
 * Select the worker. Defaults to the token-free MockAgent; only returns the
 * real Anthropic agent when explicitly enabled AND a key is present. This is
 * the one place the worker is chosen — the orchestrator stays provider-blind.
 */
export function createAgent(env: AgentSelection): Agent {
  if (env.USE_REAL_AGENT && env.ANTHROPIC_API_KEY) {
    return new AnthropicAgent({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return new MockAgent();
}
