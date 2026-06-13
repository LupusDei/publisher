import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicResearchAgent } from "../../src/agent/anthropic-research-agent.js";
import {
  errorToAlarm,
  finishReasonToAlarm,
} from "../../src/agent/alarm-mapping.js";

/**
 * Deterministic unit tests for the real-research worker. The official
 * `@anthropic-ai/sdk` client is MOCKED end-to-end (no network, no key). We
 * assert: the server-side web_search tool is requested, REAL source URLs are
 * extracted from search-result + citation blocks, usage/finishReason surface,
 * and SDK faults map onto the existing alarm helpers (D13/D20).
 */

/** A minimal Anthropic-shaped Usage block (only the fields we read). */
function usage(input: number, output: number, searches = 1) {
  return {
    input_tokens: input,
    output_tokens: output,
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    inference_geo: null,
    output_tokens_details: null,
    server_tool_use: {
      web_fetch_requests: 0,
      web_search_requests: searches,
    },
    service_tier: null,
  };
}

/**
 * A realistic web-search assistant response: a search decision, a
 * server_tool_use, a web_search_tool_result with two results, and a final
 * cited text block (one citation URL overlaps a result, one is citation-only).
 */
function webSearchResponse() {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: usage(6000, 900, 2),
    content: [
      { type: "text", text: "I'll research that.", citations: null },
      {
        type: "server_tool_use",
        id: "srvtoolu_1",
        name: "web_search",
        input: { query: "the concept" },
      },
      {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_1",
        caller: { type: "direct" },
        content: [
          {
            type: "web_search_result",
            url: "https://en.wikipedia.org/wiki/A",
            title: "A — Wikipedia",
            encrypted_content: "enc-a",
            page_age: "April 30, 2025",
          },
          {
            type: "web_search_result",
            url: "https://example.org/b",
            title: "B",
            encrypted_content: "enc-b",
            page_age: null,
          },
        ],
      },
      {
        type: "text",
        text: "The synthesized finding is grounded in the sources.",
        citations: [
          {
            type: "web_search_result_location",
            url: "https://en.wikipedia.org/wiki/A",
            title: "A — Wikipedia",
            encrypted_index: "idx-a",
            cited_text: "some cited text",
          },
          {
            type: "web_search_result_location",
            url: "https://citation-only.example/c",
            title: "C",
            encrypted_index: "idx-c",
            cited_text: "another cited snippet",
          },
        ],
      },
    ],
  };
}

/** Build a fake Anthropic client whose `messages.create`/`parse` are stubs. */
function fakeClient(opts: { create?: unknown; parse?: unknown }): Anthropic {
  const create = vi.fn(async () => opts.create);
  const parse = vi.fn(async () => opts.parse);
  return {
    messages: { create, parse },
  } as unknown as Anthropic;
}

const system = 'You write in the authentic voice of "X".';

describe("AnthropicResearchAgent — identity", () => {
  it("should expose a stable workerId and model", () => {
    const agent = new AnthropicResearchAgent({
      apiKey: "sk-x",
      client: fakeClient({}),
    });
    expect(agent.workerId).toBe("anthropic-research");
    expect(agent.model).toBe("claude-opus-4-8");
  });

  it("should honor an overridden model", () => {
    const agent = new AnthropicResearchAgent({
      apiKey: "sk-x",
      model: "claude-sonnet-4-6",
      client: fakeClient({}),
    });
    expect(agent.model).toBe("claude-sonnet-4-6");
  });
});

describe("AnthropicResearchAgent.research — real web_search wiring", () => {
  it("should request the server-side web_search tool", async () => {
    const client = fakeClient({ create: webSearchResponse() });
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    await agent.research({ system, concept: "the concept" });

    const createMock = client.messages.create as unknown as ReturnType<
      typeof vi.fn
    >;
    expect(createMock).toHaveBeenCalledTimes(1);
    const body = createMock.mock.calls[0]![0] as {
      tools: Array<{ type: string; name: string }>;
      system?: string;
    };
    const webTool = body.tools.find((t) => t.name === "web_search");
    expect(webTool).toBeDefined();
    expect(webTool!.type).toMatch(/^web_search_/);
    // The compiled persona system rides through unchanged.
    expect(body.system).toBe(system);
  });

  it("should extract REAL source URLs from results AND citations, deduped", async () => {
    const client = fakeClient({ create: webSearchResponse() });
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    const result = await agent.research({ system, concept: "c" });

    // Two result URLs + one citation-only URL; the overlapping one is deduped.
    expect(result.value.sources).toEqual([
      "https://en.wikipedia.org/wiki/A",
      "https://example.org/b",
      "https://citation-only.example/c",
    ]);
  });

  it("should synthesize narrative text from the assistant text blocks", async () => {
    const client = fakeClient({ create: webSearchResponse() });
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    const result = await agent.research({ system, concept: "c" });
    expect(result.value.text).toContain("synthesized finding");
    expect(result.value.text.length).toBeGreaterThan(0);
  });

  it("should surface usage and finishReason from the SDK response", async () => {
    const client = fakeClient({ create: webSearchResponse() });
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    const result = await agent.research({ system, concept: "c" });
    expect(result.usage.inputTokens).toBe(6000);
    expect(result.usage.outputTokens).toBe(900);
    expect(result.usage.totalTokens).toBe(6900);
    expect(result.finishReason).toBe("stop");
  });

  it("should map a max_tokens stop_reason to a length finishReason", async () => {
    const truncated = { ...webSearchResponse(), stop_reason: "max_tokens" };
    const client = fakeClient({ create: truncated });
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    const result = await agent.research({ system, concept: "c" });
    expect(result.finishReason).toBe("length");
    // and it maps to an OUTPUT_TRUNCATED alarm via the existing helper.
    const alarm = finishReasonToAlarm(result.finishReason, {
      phase: "research",
      workerId: agent.workerId,
    });
    expect(alarm?.type).toBe("OUTPUT_TRUNCATED");
  });

  it("should map a refusal stop_reason to a refusal finishReason", async () => {
    const refused = {
      ...webSearchResponse(),
      stop_reason: "refusal",
      content: [],
    };
    const client = fakeClient({ create: refused });
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    const result = await agent.research({ system, concept: "c" });
    expect(result.finishReason).toBe("refusal");
    expect(result.value.sources).toEqual([]);
  });

  it("should continue the server loop on a pause_turn, accumulating sources", async () => {
    const paused = {
      ...webSearchResponse(),
      stop_reason: "pause_turn",
    };
    const finished = webSearchResponse();
    const create = vi
      .fn()
      .mockResolvedValueOnce(paused)
      .mockResolvedValueOnce(finished);
    const client = {
      messages: { create, parse: vi.fn() },
    } as unknown as Anthropic;
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    const result = await agent.research({ system, concept: "c" });
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.finishReason).toBe("stop");
    // Deduped across both turns — same URLs, not duplicated.
    expect(result.value.sources).toEqual([
      "https://en.wikipedia.org/wiki/A",
      "https://example.org/b",
      "https://citation-only.example/c",
    ]);
  });

  it("should tolerate a web_search_tool_result error block (no sources, no throw)", async () => {
    const errored = {
      ...webSearchResponse(),
      content: [
        { type: "text", text: "searching failed", citations: null },
        {
          type: "web_search_tool_result",
          tool_use_id: "srvtoolu_1",
          caller: { type: "direct" },
          content: {
            type: "web_search_tool_result_error",
            error_code: "max_uses_exceeded",
          },
        },
      ],
    };
    const client = fakeClient({ create: errored });
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    const result = await agent.research({ system, concept: "c" });
    expect(result.value.sources).toEqual([]);
    expect(result.value.text).toContain("searching failed");
  });

  it("should map a thrown SDK error onto a PROVIDER_ERROR alarm", async () => {
    const create = vi.fn(async () => {
      throw new Error("connection reset");
    });
    const client = {
      messages: { create, parse: vi.fn() },
    } as unknown as Anthropic;
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    await expect(agent.research({ system, concept: "c" })).rejects.toThrow(
      "connection reset",
    );
    // The orchestrator maps the thrown error via the shared helper.
    const alarm = errorToAlarm(new Error("connection reset"), {
      phase: "research",
      workerId: agent.workerId,
    });
    expect(alarm.type).toBe("PROVIDER_ERROR");
  });
});

describe("AnthropicResearchAgent.build — native structured output", () => {
  const research = {
    text: "the research narrative",
    sources: ["https://en.wikipedia.org/wiki/A", "https://example.org/b"],
  };

  function parsedWebpageResponse() {
    return {
      id: "msg_2",
      type: "message",
      role: "assistant",
      model: "claude-opus-4-8",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: usage(1200, 800, 0),
      content: [],
      parsed_output: {
        title: "Generated Page",
        html: "<main><h1>Generated Page</h1></main>",
        css: "main{max-width:680px}",
        summary: "A page synthesized from real research.",
        sourcesUsed: [],
      },
    };
  }

  it("should request structured output and return a valid Webpage", async () => {
    const client = fakeClient({ parse: parsedWebpageResponse() });
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    const result = await agent.build({ system, research });

    const parseMock = client.messages.parse as unknown as ReturnType<
      typeof vi.fn
    >;
    expect(parseMock).toHaveBeenCalledTimes(1);
    const body = parseMock.mock.calls[0]![0] as {
      output_config: { format: unknown };
      system?: string;
    };
    expect(body.output_config.format).toBeDefined();
    expect(body.system).toBe(system);
    expect(result.value.title).toBe("Generated Page");
    expect(result.value.html).toContain("<main>");
  });

  it("should carry the research sources into sourcesUsed", async () => {
    const client = fakeClient({ parse: parsedWebpageResponse() });
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    const result = await agent.build({ system, research });
    // Even though the model returned [], the worker grounds sourcesUsed in the
    // REAL research sources so the published page cites genuine URLs.
    expect(result.value.sourcesUsed).toEqual(research.sources);
  });

  it("should include the feedback in the prompt on a refine pass", async () => {
    const client = fakeClient({ parse: parsedWebpageResponse() });
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    await agent.build({ system, research, feedback: "be warmer" });
    const parseMock = client.messages.parse as unknown as ReturnType<
      typeof vi.fn
    >;
    const body = parseMock.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const prompt = body.messages.map((m) => m.content).join("\n");
    expect(prompt).toContain("be warmer");
  });

  it("should surface usage and finishReason from the build response", async () => {
    const client = fakeClient({ parse: parsedWebpageResponse() });
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    const result = await agent.build({ system, research });
    expect(result.usage.totalTokens).toBe(2000);
    expect(result.finishReason).toBe("stop");
  });

  it("should throw when the model returns no parsed output", async () => {
    const empty = { ...parsedWebpageResponse(), parsed_output: null };
    const client = fakeClient({ parse: empty });
    const agent = new AnthropicResearchAgent({ apiKey: "sk-x", client });
    await expect(agent.build({ system, research })).rejects.toThrow();
  });
});
