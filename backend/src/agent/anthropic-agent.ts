import {
  generateText,
  generateObject,
  stepCountIs,
  type LanguageModel,
} from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGateway } from "@ai-sdk/gateway";
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
  /** Stable worker id (R8/R11) — labels which worker produced the output. */
  workerId?: string;
}

export interface GatewayAgentOptions {
  /** Vercel AI Gateway key (AI_GATEWAY_API_KEY) — one key, every provider. */
  apiKey: string;
  /** Gateway model slug, e.g. "openai/gpt-5" or "anthropic/claude-opus-4-8". */
  model: string;
  /** Stable worker id (R8/R11) — labels which worker produced the output. */
  workerId?: string;
}

/**
 * AI SDK usage shape (v6 `LanguageModelUsage`). The v4→v6 rename is
 * `promptTokens`/`completionTokens` → `inputTokens`/`outputTokens`, and every
 * field is now `number | undefined`. Mapped to our Usage contract.
 */
interface SdkUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/* c8 ignore start -- env-gated real provider path; not exercised in CI (ASSUMPTIONS D20). */
function toUsage(u: SdkUsage | undefined): Usage {
  const inputTokens = u?.inputTokens ?? 0;
  const outputTokens = u?.outputTokens ?? 0;
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
 * Real Agent over the Vercel AI SDK (`ai`). The research/build bodies are
 * provider-blind — they only touch a `LanguageModel` — so the SAME logic backs
 * every provider; concrete subclasses differ ONLY in how they construct that
 * model (the direct Anthropic provider vs the Vercel AI Gateway, model-agnostic
 * — R8/R11). Env-gated; never selected unless USE_REAL_AGENT=true and a key is
 * present, so it is not exercised in CI (contract-shape tests cover construction
 * with the `ai` module mocked).
 *
 * KNOWN GAP: no server-side web_search/web_fetch is wired here, so research()
 * returns empty sources (ASSUMPTIONS D13; real web tools live in the
 * official-SDK research worker). On `ai@^6` the multi-step loop is bounded with
 * `stopWhen: stepCountIs(N)` (the v4 `maxSteps` knob was removed). The agent
 * receives a compiled `system` string and returns `AgentResult<T>` with
 * usage/finishReason (D2). No `temperature` is sent — opus-4-8 rejects it.
 */
export abstract class AiSdkAgent implements Agent {
  /** The worker identity surfaced through the seam (R8/R11). */
  readonly workerId: string;
  readonly model: string;
  protected readonly languageModel: LanguageModel;

  protected constructor(
    languageModel: LanguageModel,
    model: string,
    workerId: string,
  ) {
    this.languageModel = languageModel;
    this.model = model;
    this.workerId = workerId;
  }

  async research(input: {
    system: string;
    concept: string;
  }): Promise<AgentResult<ResearchResult>> {
    const { text, usage, finishReason } = await generateText({
      model: this.languageModel,
      system: input.system,
      prompt: `Research the following concept in depth, gathering credible, citable detail:\n\n${input.concept}`,
      // ai v6: bound the multi-step loop here (the v4 `maxSteps` was removed).
      stopWhen: stepCountIs(8),
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
      model: this.languageModel,
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

/**
 * Direct-Anthropic build worker (`@ai-sdk/anthropic`). The original real worker;
 * model ids are bare Anthropic strings (e.g. "claude-opus-4-8").
 */
export class AnthropicAgent extends AiSdkAgent {
  constructor(opts: AnthropicAgentOptions) {
    const model = opts.model ?? "claude-opus-4-8";
    const provider = createAnthropic({ apiKey: opts.apiKey });
    super(provider(model), model, opts.workerId ?? "opus");
  }
}

/**
 * Multi-provider build worker over the Vercel AI Gateway (`@ai-sdk/gateway`).
 * ONE key (AI_GATEWAY_API_KEY) reaches every provider the gateway serves —
 * model ids are `provider/model` slugs (e.g. "openai/gpt-5"). This is the
 * model-agnostic seam realised: no per-provider SDK or wrapper class.
 */
export class GatewayAgent extends AiSdkAgent {
  constructor(opts: GatewayAgentOptions) {
    const provider = createGateway({ apiKey: opts.apiKey });
    super(provider(opts.model), opts.model, opts.workerId ?? opts.model);
  }
}
/* c8 ignore stop */
