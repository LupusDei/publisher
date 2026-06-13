import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import {
  WebpageSchema,
  type AgentResult,
  type FinishReason,
  type ResearchResult,
  type Usage,
  type Webpage,
} from "@publisher/shared";
import type { Agent } from "./agent.js";

/**
 * The REAL-research worker (ASSUMPTIONS D13). Built on the OFFICIAL Anthropic
 * SDK (`@anthropic-ai/sdk`) Messages API with the server-side `web_search`
 * tool, so `research()` returns a genuine narrative synthesized over live web
 * results PLUS the REAL source URLs those results came from. This is the second
 * genuinely-different worker behind the same `Agent` seam (R8/R11): Worker A is
 * the Vercel-AI-SDK `AnthropicAgent` (no web tools), Worker B is THIS one.
 *
 * Deterministic, network-free unit tests inject a fake client via `opts.client`
 * and mock `messages.create` / `messages.parse`. The real network path is
 * env-gated (USE_REAL_AGENT + key + worker selected) and never runs in CI; it
 * is excluded from coverage per D20 with a contract-shape test covering the
 * mocked path fully.
 */

/** The server-side web search tool version (GA, returns cited results). */
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  /** Bound the search loop so a single research call can't runaway. */
  max_uses: 8,
};

/** Hard ceiling on server-loop continuations (pause_turn) per research call. */
const MAX_PAUSE_CONTINUATIONS = 4;

export interface AnthropicResearchAgentOptions {
  apiKey: string;
  /** Research/build model. Defaults to the most capable Opus. */
  model?: string;
  /** Stable worker id (R8/R11). */
  workerId?: string;
  /**
   * Optional pre-built client. Tests inject a fake whose `messages.create`/
   * `messages.parse` are stubbed so no network call happens. Production passes
   * none and a real `Anthropic` client is constructed from `apiKey`.
   */
  client?: Anthropic;
}

/**
 * The Webpage shape, authored against the SDK's bundled `zod/v4` so it can be
 * handed to `zodOutputFormat` (the helper requires a v4 schema). The parsed
 * result is re-validated against the shared (zod v3) `WebpageSchema` so the
 * value crossing the seam is exactly the canonical `Webpage` contract.
 */
const WebpageOutputSchema = z.object({
  title: z.string(),
  html: z.string(),
  css: z.string(),
  summary: z.string(),
  sourcesUsed: z.array(z.string()),
});

/* c8 ignore start -- env-gated real provider path; not exercised in CI (ASSUMPTIONS D20).
 * Coverage is asserted on the MOCKED-client path; only the live `new Anthropic`
 * construction below is genuinely untestable without a key/network. */
function defaultClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}
/* c8 ignore stop */

/** Map the official SDK `stop_reason` onto our FinishReason contract. */
function toFinishReason(stop: string | null | undefined): FinishReason {
  switch (stop) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool-calls";
    case "refusal":
      return "refusal";
    default:
      // `pause_turn` is resolved by the continuation loop and never surfaces;
      // anything else is mapped to the catch-all.
      return "other";
  }
}

/** Anthropic `usage` block fields we read (the rest are ignored). */
interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
}

/** Map the SDK usage block onto our Usage contract. */
function toUsage(u: AnthropicUsage | null | undefined): Usage {
  const inputTokens = u?.input_tokens ?? 0;
  const outputTokens = u?.output_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

/**
 * A loose view of the assistant content blocks we read. We deliberately avoid
 * importing the SDK's full discriminated union here: we only ever read `type`,
 * `text`, `citations`, and `content[].url`, all narrowed at the access site.
 */
interface LooseBlock {
  type: string;
  text?: string;
  citations?: Array<{ type?: string; url?: string }> | null;
  content?: unknown;
}

/** A single web_search_result item. */
interface SearchResultItem {
  type?: string;
  url?: string;
}

/**
 * Pull every REAL source URL out of an assistant message's content blocks:
 *   - `web_search_tool_result` blocks → each `web_search_result.url`
 *   - cited `text` blocks → each `web_search_result_location.url`
 * Mutates `sources` (an ordered, de-duplicating accumulator) and appends any
 * narrative `text` to `textParts`.
 */
function harvestBlocks(
  blocks: readonly LooseBlock[],
  sources: string[],
  seen: Set<string>,
  textParts: string[],
): void {
  for (const block of blocks) {
    if (block.type === "text" && typeof block.text === "string") {
      textParts.push(block.text);
      for (const citation of block.citations ?? []) {
        addSource(citation?.url, sources, seen);
      }
      continue;
    }
    if (block.type === "web_search_tool_result") {
      // `content` is either an error object or an array of result items.
      const content = block.content;
      if (Array.isArray(content)) {
        for (const item of content as SearchResultItem[]) {
          if (item?.type === "web_search_result") {
            addSource(item.url, sources, seen);
          }
        }
      }
    }
  }
}

/** Append a non-empty, not-yet-seen URL, preserving discovery order. */
function addSource(
  url: string | undefined,
  sources: string[],
  seen: Set<string>,
): void {
  if (typeof url === "string" && url.length > 0 && !seen.has(url)) {
    seen.add(url);
    sources.push(url);
  }
}

export class AnthropicResearchAgent implements Agent {
  /** The worker identity surfaced through the seam (R8/R11). */
  readonly workerId: string;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(opts: AnthropicResearchAgentOptions) {
    this.model = opts.model ?? "claude-opus-4-8";
    this.workerId = opts.workerId ?? "anthropic-research";
    this.client = opts.client ?? defaultClient(opts.apiKey);
  }

  /**
   * RESEARCH phase: run the server-side web_search loop under the compiled
   * `system`, synthesize the narrative from the returned text, and collect the
   * REAL source URLs. Continues across `pause_turn` (the server-side tool loop)
   * up to a bounded number of turns, accumulating sources across continuations.
   */
  async research(input: {
    system: string;
    concept: string;
  }): Promise<AgentResult<ResearchResult>> {
    const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
      {
        role: "user",
        content:
          `Research the following concept in depth using web search. Gather ` +
          `credible, citable detail from multiple independent sources, then ` +
          `synthesize a clear narrative grounded in what you found.\n\n` +
          `CONCEPT:\n${input.concept}`,
      },
    ];

    const sources: string[] = [];
    const seen = new Set<string>();
    const textParts: string[] = [];
    let usage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let finishReason: FinishReason = "other";

    for (let turn = 0; turn <= MAX_PAUSE_CONTINUATIONS; turn += 1) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8000,
        system: input.system,
        thinking: { type: "adaptive" },
        tools: [WEB_SEARCH_TOOL],
        messages: messages as Anthropic.MessageParam[],
      });

      const blocks = (response.content ?? []) as unknown as LooseBlock[];
      harvestBlocks(blocks, sources, seen, textParts);

      // Accumulate usage across continuations; last finishReason wins.
      const turnUsage = toUsage(response.usage as AnthropicUsage);
      usage = {
        inputTokens: usage.inputTokens + turnUsage.inputTokens,
        outputTokens: usage.outputTokens + turnUsage.outputTokens,
        totalTokens: usage.totalTokens + turnUsage.totalTokens,
      };
      finishReason = toFinishReason(response.stop_reason);

      if (response.stop_reason !== "pause_turn") break;

      // Server paused mid-loop: echo the assistant turn back to resume. No
      // synthetic "Continue." message — the trailing server_tool_use resumes.
      messages.push({ role: "assistant", content: response.content });
    }

    return {
      value: { text: textParts.join("\n\n").trim(), sources },
      usage,
      finishReason,
    };
  }

  /**
   * BUILD/REFINE phase: native structured output (`messages.parse` +
   * `zodOutputFormat`) yields a typed Webpage. `sourcesUsed` is grounded in the
   * REAL research sources (not whatever the model echoes) so the published page
   * cites genuine URLs. `feedback` drives the refine pass.
   */
  async build(input: {
    system: string;
    research: ResearchResult;
    feedback?: string;
  }): Promise<AgentResult<Webpage>> {
    const promptParts = [
      `Using the research below, produce a self-contained single-page webpage ` +
        `in this persona's voice and design. Return ONLY the structured fields.`,
      `RESEARCH:\n${input.research.text}`,
      `SOURCES (cite these in sourcesUsed):\n${input.research.sources.join("\n")}`,
    ];
    if (input.feedback) {
      promptParts.push(`FEEDBACK TO ADDRESS:\n${input.feedback}`);
    }

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16000,
      system: input.system,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: promptParts.join("\n\n") }],
      output_config: { format: zodOutputFormat(WebpageOutputSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        "AnthropicResearchAgent.build: model returned no parsed structured output",
      );
    }

    // Re-validate against the canonical (shared) contract and ground the cited
    // sources in the REAL research URLs.
    const webpage: Webpage = WebpageSchema.parse({
      ...parsed,
      sourcesUsed: input.research.sources,
    });

    return {
      value: webpage,
      usage: toUsage(response.usage as AnthropicUsage),
      finishReason: toFinishReason(response.stop_reason),
    };
  }
}
