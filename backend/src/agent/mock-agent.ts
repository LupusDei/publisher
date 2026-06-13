import type { Persona, Webpage } from "@publisher/shared";
import type { Agent, ResearchResult } from "./agent.js";

/**
 * Deterministic, token-free Agent implementation. This is the DEFAULT worker so
 * the harness (orchestrator, checkpoints, alarms, UI) can be developed and
 * tested without an API key or burning tokens. Output is real-shaped — it
 * satisfies the same contracts the real agent must.
 */
export class MockAgent implements Agent {
  async research(persona: Persona, concept: string): Promise<ResearchResult> {
    const lead = persona.keyLearnings[0] ?? "first principles";
    return {
      text:
        `Research summary for "${concept}", framed through ${persona.name}'s lens ` +
        `(anchored on: ${lead}). Three threads explored with corroborating sources.`,
      sources: [
        "https://example.com/source-a",
        "https://example.com/source-b",
        "https://example.com/source-c",
      ],
    };
  }

  async build(
    persona: Persona,
    research: ResearchResult,
    feedback?: string,
  ): Promise<Webpage> {
    const refinedNote = feedback ? ` — revised to address feedback` : "";
    return {
      title: `${persona.name}: ${research.sources.length} sources, one page${refinedNote}`,
      html:
        `<main><h1>${persona.name}</h1>` +
        `<p>${research.text}</p>` +
        (feedback ? `<!-- refine: ${feedback} -->` : "") +
        `</main>`,
      css: "main{font-family:Georgia,serif;max-width:680px;margin:0 auto;padding:48px 24px}",
      summary: `A page synthesizing ${research.sources.length} sources in ${persona.name}'s voice.`,
      sourcesUsed: research.sources,
    };
  }
}
