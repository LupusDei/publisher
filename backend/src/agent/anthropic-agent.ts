import { generateText, generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import {
  WebpageSchema,
  type AgentResult,
  type FinishReason,
  type ResearchResult,
  type Usage,
  type Webpage,
} from "@publisher/shared";
import type { Agent } from "./agent.js";

export interface AnthropicAgentOptions {
  apiKey: string;
  /** Default research/build model. Swap for the portability bonus. */
  model?: string;
}

/** AI SDK usage shape (v4 `LanguageModelUsage`). Mapped to our Usage contract. */
interface SdkUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/* c8 ignore start -- env-gated real provider path; not exercised in CI (ASSUMPTIONS D20). */
function toUsage(u: SdkUsage | undefined): Usage {
  const inputTokens = u?.promptTokens ?? 0;
  const outputTokens = u?.completionTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: u?.totalTokens ?? inputTokens + outputTokens,
  };
}

/** Map the SDK's finish reason string onto our FinishReason enum. */
function toFinishReason(r: string | undefined): FinishReason {
  switch (r) {
    case "stop":
    case "length":
    case "content-filter":
    case "error":
      return r;
    case "tool-calls":
      return "tool-calls";
    default:
      return "other";
  }
}

/**
 * Real Agent implementation over the Vercel AI SDK (`ai` + `@ai-sdk/anthropic`).
 * Env-gated; never selected unless USE_REAL_AGENT=true and a key is present, so
 * it is not exercised in CI (a contract-shape test covers construction).
 *
 * KNOWN GAP (`@ai-sdk/anthropic@1.2.12`): no server-side web_search/web_fetch,
 * so research() returns empty sources (ASSUMPTIONS D13). `ai@4.x` uses
 * `maxSteps`. The agent now receives a compiled `system` string and returns
 * `AgentResult<T>` with usage/finishReason (D2).
 */
export class AnthropicAgent implements Agent {
  private readonly model: ReturnType<ReturnType<typeof createAnthropic>>;

  constructor(opts: AnthropicAgentOptions) {
    const provider = createAnthropic({ apiKey: opts.apiKey });
    this.model = provider(opts.model ?? "claude-opus-4-8");
  }

  async research(input: {
    system: string;
    concept: string;
  }): Promise<AgentResult<ResearchResult>> {
    const { text, usage, finishReason } = await generateText({
      model: this.model,
      system: input.system,
      prompt: `Research the following concept in depth, gathering credible, citable detail:\n\n${input.concept}`,
      maxSteps: 8,
    });
    // TODO(follow-up bead): populate sources from real web tools once available.
    return {
      value: { text, sources: [] },
      usage: toUsage(usage as SdkUsage),
      finishReason: toFinishReason(finishReason),
    };
  }

  async build(input: {
    system: string;
    research: ResearchResult;
    feedback?: string;
  }): Promise<AgentResult<Webpage>> {
    const { object, usage, finishReason } = await generateObject({
      model: this.model,
      schema: WebpageSchema,
      system: input.system,
      prompt:
        `Using the research below, produce a self-contained single-page webpage ` +
        `in this persona's voice and design.\n\nRESEARCH:\n${input.research.text}\n\n` +
        (input.feedback ? `FEEDBACK TO ADDRESS:\n${input.feedback}\n` : ""),
    });
    return {
      value: object,
      usage: toUsage(usage as SdkUsage),
      finishReason: toFinishReason(finishReason),
    };
  }
}
/* c8 ignore stop */
