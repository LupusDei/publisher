# Publisher — Agent Integration Decision

> How Publisher's backend drives the agent. Wrapper: the **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`), chosen for one-line provider/model switching.

## Decision: Vercel AI SDK over the Anthropic provider

Use the **`ai` package** (`generateText` / `streamText` / `generateObject` / `tool`) with **`@ai-sdk/anthropic`** as the provider. The agent lives behind one `Agent` seam; swapping the worker — a different Claude model, or a different *provider* entirely (OpenAI, Google) — is a one-line `model` change. That makes the **portability bonus nearly free**.

```ts
import { anthropic } from "@ai-sdk/anthropic";
const model = anthropic("claude-opus-4-8");   // swap: anthropic("claude-sonnet-4-6"), openai("…"), google("…")
```

### How it covers every need

| Need | AI SDK |
|---|---|
| **System prompt** | `system:` (the compiled persona). Cache it via a message part with `providerOptions.anthropic.cacheControl`. |
| **Multi-turn context** | We hold the `ModelMessage[]` array → maps 1:1 onto the SQLite journal + replay. |
| **Image context** | `image`/`file` content parts in a user message. |
| **Tool use** | `tool({ description, inputSchema: z.object(...), execute })`; multi-step loop via `stopWhen: stepCountIs(n)`. |
| **Research** | Anthropic server-side tools — `anthropic.tools.webSearch_20250305(...)` + `anthropic.tools.webFetch_20250910(...)` — passed in `tools` with no `execute` (provider-executed). |
| **Streaming** | `streamText(...)` → `result.textStream` / `result.toUIMessageStreamResponse()` to the web UI. |
| **Structured material-out** | `generateObject({ model, schema })` with a Zod schema → typed `{ title, html, css, summary, sourcesUsed }`. |
| **Thinking / effort** | `providerOptions.anthropic.{ thinking: { type: "adaptive" }, effort: "high" }`. |
| **Per-call telemetry** | `result.usage` (`inputTokens`/`outputTokens`/`totalTokens`); cache-token breakdown via `result.providerMetadata.anthropic`. `result.finishReason` → alarms. |

### The honest tradeoff (state this in the defense)
The AI SDK is a **provider abstraction**, so the *core* loop (generate / stream / tools / structured output) is genuinely provider-portable. But the bits that buy us the most are **Anthropic-specific** and reached through provider hooks:
- **Server-side web search/fetch** are `@ai-sdk/anthropic` tools — they won't carry to OpenAI/Google; a different provider needs its own research approach.
- **Prompt caching** is `providerOptions.anthropic.cacheControl` — Anthropic-scoped.

For Publisher this is the right trade: research depth and caching are naturally provider-specific anyway, while the part we actually want portable — the build/refine loop and the `Agent` seam — *is* portable. We accept a thin abstraction layer (and trusting it to track API changes) in exchange for trivial agent-swapping.

> Version note: the AI SDK has a `ToolLoopAgent` class (v6) and `stopWhen`/`stepCountIs` loop helpers; tool-version tags (`webSearch_20250305`, `webFetch_20250910`) move over time. Verify exact names against the installed `ai` / `@ai-sdk/anthropic` version before relying on them.

## The `Agent` seam (swap point)

```ts
import { generateText, generateObject, streamText, stepCountIs, type LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

export interface AgentDeps {
  model: LanguageModel;     // anthropic("claude-opus-4-8") — the swap point
}

const WebpageSchema = z.object({
  title: z.string(),
  html: z.string(),
  css: z.string(),
  summary: z.string(),
  sourcesUsed: z.array(z.string()),
});

export class Agent {
  constructor(private deps: AgentDeps) {}

  // RESEARCH — provider-executed web tools, bounded multi-step loop
  async research(persona: string, concept: string) {
    const { text, usage, providerMetadata } = await generateText({
      model: this.deps.model,
      system: persona,
      prompt: concept,
      tools: {
        web_search: anthropic.tools.webSearch_20250305({ maxUses: 5 }),
        web_fetch: anthropic.tools.webFetch_20250910({ maxUses: 3 }),
      },
      stopWhen: stepCountIs(8),
      providerOptions: { anthropic: { thinking: { type: "adaptive" }, effort: "high" } },
    });
    return { text, usage, providerMetadata };   // usage → Observability pillar
  }

  // BUILD — typed material-out, persona cached as a prefix
  async build(persona: string, research: string, feedback?: string) {
    const { object, usage, providerMetadata } = await generateObject({
      model: this.deps.model,
      schema: WebpageSchema,
      messages: [
        { role: "system", content: persona,
          providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
        { role: "user", content: `${research}\n\n${feedback ?? ""}` },
      ],
    });
    return { webpage: object, usage, providerMetadata };
  }
}
```

The orchestrator runs the loop: `research()` → research-sufficiency checkpoint → `build()` → voice/design/quality checkpoints → on failure, append feedback and `build()` again (≤ `MAX_ATTEMPTS`) → publish. Each call's `usage` feeds the Observability pillar; `finishReason` + thrown errors feed the alarms.

## Pillar wiring
- **Guardrails (persona)** → `system` (preventive); detective validators run in TS on the result.
- **Material** → concept in via `prompt`/`messages`; research via Anthropic web tools; webpage out via `generateObject`.
- **Checkpoints** → run in TS on the result; feedback loops by appending a message and calling `build()` again.
- **Observability & Alarms** → `usage` + `providerMetadata` (token cost/phase), TS timers (latency), `finishReason`/errors (error rate) → thresholds fire the named structured alarms.

## Models & deploy
- Default `anthropic("claude-opus-4-8")`; cheaper judge checkpoints on `anthropic("claude-haiku-4-5")` / `anthropic("claude-sonnet-4-6")`.
- Portability bonus = pass a different `model` to `AgentDeps`. Same harness, same loop.
- Backend is just outbound API calls → local now, cloud-deployable later (SQLite → Turso/libSQL).
