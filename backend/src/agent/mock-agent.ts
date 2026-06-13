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
 *
 * SCRIPTED DRIFT→PASS (ASSUMPTIONS D12 — the R2 money shot). `build` is
 * deterministic on a single axis: the PRESENCE of `feedback`.
 *   • attempt 1 (no feedback)  → deliberately OFF-VOICE content: an overly
 *     formal/academic register that ignores the persona's style points. This is
 *     what the voice-fidelity checkpoint catches as VOICE_DRIFT.
 *   • any attempt WITH feedback → ON-VOICE content (warm, plain, second-person)
 *     that passes the gate.
 * This guarantees the "draft-1 fails → feedback → draft-2 passes" demo without
 * a live, non-deterministic judge. The content depends ONLY on whether feedback
 * is present (not on its text), so the beat is byte-for-byte reproducible.
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

/**
 * The OFF-VOICE draft (attempt 1). Stuffed with formal/academic tells
 * ("Furthermore", "heretofore", "aforementioned") and a stiff register — the
 * deterministic trigger for the voice-fidelity gate's VOICE_DRIFT failure.
 */
function offVoiceWebpage(research: ResearchResult): Webpage {
  const html =
    `<main data-voice="off"><h1>A Treatise Upon the Subject Heretofore Considered</h1>` +
    `<p>Furthermore, it must be observed that the aforementioned material, ` +
    `pursuant to rigorous academic convention, warrants exhaustive elaboration. ` +
    `${research.text}</p>` +
    `<p>Furthermore, the reader is hereby advised to consider the foregoing ` +
    `with the utmost formality and scholarly detachment.</p></main>`;
  return {
    title: "A Treatise Upon the Subject Heretofore Considered",
    html,
    css: "main{font-family:'Times New Roman',serif;max-width:680px;margin:0 auto;padding:48px 24px;text-align:justify}",
    summary:
      "A formal, academic treatment of the subject, composed in a detached scholarly register.",
    sourcesUsed: research.sources,
  };
}

/**
 * The ON-VOICE draft (any attempt with feedback). Warm, plain-spoken,
 * second-person — the formal tells are gone and a `data-voice="on"` marker plus
 * a `refine:` note make the redraft diffable and gate-passing. The content is
 * intentionally independent of the feedback TEXT so the beat is byte-for-byte
 * reproducible — only the PRESENCE of feedback flips the draft on-voice.
 */
function onVoiceWebpage(research: ResearchResult): Webpage {
  const html =
    `<main data-voice="on"><h1>Here's the idea, plainly</h1>` +
    `<p>You already feel this, even if you've never named it. ${research.text}</p>` +
    `<p>So here's what it means for you, in plain terms — no hedging, no jargon.</p>` +
    `<!-- refine: applied voice feedback --></main>`;
  return {
    title: "Here's the idea, plainly",
    html,
    css: "main{font-family:Georgia,serif;max-width:680px;margin:0 auto;padding:48px 24px}",
    summary: `A warm, plain-spoken page synthesizing ${research.sources.length} sources.`,
    sourcesUsed: research.sources,
  };
}

export class MockAgent implements Agent {
  /** The token-free worker identity (R8/R11) — surfaced to the UI run header. */
  readonly workerId = "mock";
  readonly model = "mock";

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
    // The scripted axis (D12): no feedback → off-voice; feedback → on-voice.
    const value =
      feedback === undefined || feedback === ""
        ? offVoiceWebpage(research)
        : onVoiceWebpage(research);
    return {
      value,
      usage: syntheticUsage(
        `${system}\n${research.text}\n${feedback ?? ""}`,
        value.html,
      ),
      finishReason: "stop",
    };
  }
}
