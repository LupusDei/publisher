import type { Persona, Webpage } from "@publisher/shared";

/**
 * The single Agent seam. The orchestrator (future) only ever talks to this
 * interface — never to the pillars and never to a concrete provider. Swapping
 * the worker (a different Claude model, or a whole different provider) happens
 * behind this boundary, which is the portability bonus.
 */
export interface ResearchResult {
  /** The agent's synthesized research narrative. */
  text: string;
  /** Source URLs the agent drew on (may be empty in the stub). */
  sources: string[];
}

export interface Agent {
  /** RESEARCH phase: gather credible depth on a concept, in the persona's lens. */
  research(persona: Persona, concept: string): Promise<ResearchResult>;
  /** BUILD/REFINE phase: produce a typed webpage; `feedback` drives a refine pass. */
  build(
    persona: Persona,
    research: ResearchResult,
    feedback?: string,
  ): Promise<Webpage>;
}

/** Compile a persona into a system-prompt fragment. A minimal preview of the
 * Guardrails pillar — the full declared-guardrail compile is a separate epic. */
export function compilePersonaSystem(persona: Persona): string {
  return [
    `You write in the authentic voice of "${persona.name}".`,
    persona.voice ? `Voice: ${persona.voice}` : "",
    persona.stylePoints.length
      ? `Style points: ${persona.stylePoints.join("; ")}`
      : "",
    persona.keyLearnings.length
      ? `Key learnings to draw on: ${persona.keyLearnings.join("; ")}`
      : "",
    Object.keys(persona.designElements).length
      ? `Design elements: ${Object.entries(persona.designElements)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
