import type {
  AgentResult,
  ResearchResult,
  Usage,
  Webpage,
} from "@publisher/shared";
import type { Agent } from "./agent.js";

/**
 * Deterministic, token-free Agent implementation. The DEFAULT worker so the
 * harness (orchestrator, checkpoints, alarms, UI) develops and tests without an
 * API key or burning tokens. Output is real-shaped — it satisfies the same
 * contracts the real agent must, INCLUDING synthetic-but-real-shaped `usage`
 * and a `finishReason`, so Observability is testable offline (ASSUMPTIONS D2).
 */

/** Crude but stable token estimate: ~4 chars/token, never below 1. */
function estimateTokens(s: string): number {
  return Math.max(1, Math.ceil(s.length / 4));
}

/** Build a real-shaped Usage from an input and output string. */
function syntheticUsage(input: string, output: string): Usage {
  const inputTokens = estimateTokens(input);
  const outputTokens = estimateTokens(output);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

export class MockAgent implements Agent {
  async research(input: {
    system: string;
    concept: string;
  }): Promise<AgentResult<ResearchResult>> {
    const { system, concept } = input;
    const text =
      `Research summary for "${concept}". Three threads explored with ` +
      `corroborating sources, synthesized under the compiled persona system.`;
    const value: ResearchResult = {
      text,
      sources: [
        "https://example.com/source-a",
        "https://example.com/source-b",
        "https://example.com/source-c",
      ],
    };
    return {
      value,
      usage: syntheticUsage(`${system}\n${concept}`, text),
      finishReason: "stop",
    };
  }

  async build(input: {
    system: string;
    research: ResearchResult;
    feedback?: string;
  }): Promise<AgentResult<Webpage>> {
    const { system, research, feedback } = input;
    const refinedNote = feedback ? ` — revised to address feedback` : "";
    const html =
      `<main><h1>Published Page</h1>` +
      `<p>${research.text}</p>` +
      (feedback ? `<!-- refine: ${feedback} -->` : "") +
      `</main>`;
    const value: Webpage = {
      title: `${research.sources.length} sources, one page${refinedNote}`,
      html,
      css: "main{font-family:Georgia,serif;max-width:680px;margin:0 auto;padding:48px 24px}",
      summary: `A page synthesizing ${research.sources.length} sources.`,
      sourcesUsed: research.sources,
    };
    return {
      value,
      usage: syntheticUsage(
        `${system}\n${research.text}\n${feedback ?? ""}`,
        html,
      ),
      finishReason: "stop",
    };
  }
}
