import { generateText, generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { WebpageSchema, type Persona, type Webpage } from "@publisher/shared";
import {
  compilePersonaSystem,
  type Agent,
  type ResearchResult,
} from "./agent.js";

export interface AnthropicAgentOptions {
  apiKey: string;
  /** Default research/build model. Swap for the portability bonus. */
  model?: string;
}

/**
 * Real Agent implementation over the Vercel AI SDK (`ai` + `@ai-sdk/anthropic`).
 * SKELETON — env-gated; never selected unless USE_REAL_AGENT=true and a key is
 * present, so it is not exercised in CI.
 *
 * KNOWN GAP (verified against installed `@ai-sdk/anthropic@1.2.12`):
 *   This provider version exposes only bash/textEditor/computer tools — NOT the
 *   server-side `web_search`/`web_fetch` tools the design doc assumes. So
 *   research() currently runs without live web tools (sources come back empty).
 *   Wiring real research (provider upgrade or an alternate tool) is tracked as a
 *   follow-up bead. `ai@4.x` also uses `maxSteps`, not v5's `stepCountIs`.
 */
export class AnthropicAgent implements Agent {
  private readonly model: ReturnType<ReturnType<typeof createAnthropic>>;

  constructor(opts: AnthropicAgentOptions) {
    const provider = createAnthropic({ apiKey: opts.apiKey });
    this.model = provider(opts.model ?? "claude-opus-4-8");
  }

  async research(persona: Persona, concept: string): Promise<ResearchResult> {
    const { text } = await generateText({
      model: this.model,
      system: compilePersonaSystem(persona),
      prompt: `Research the following concept in depth, gathering credible, citable detail:\n\n${concept}`,
      maxSteps: 8,
    });
    // TODO(follow-up bead): populate sources from real web tools once available.
    return { text, sources: [] };
  }

  async build(
    persona: Persona,
    research: ResearchResult,
    feedback?: string,
  ): Promise<Webpage> {
    const { object } = await generateObject({
      model: this.model,
      schema: WebpageSchema,
      system: compilePersonaSystem(persona),
      prompt:
        `Using the research below, produce a self-contained single-page webpage ` +
        `in this persona's voice and design.\n\nRESEARCH:\n${research.text}\n\n` +
        (feedback ? `FEEDBACK TO ADDRESS:\n${feedback}\n` : ""),
    });
    return object;
  }
}
