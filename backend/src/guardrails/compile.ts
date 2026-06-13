import type { Persona } from "@publisher/shared";

/**
 * Compile a persona into a system-prompt fragment — the PREVENTIVE half of the
 * Guardrails pillar (Pillar 2). This is the minimal relocation out of the worker
 * (ASSUMPTIONS D2); Track B enriches it with the detective validators and the
 * fixed design-token vocabulary. The orchestrator passes the returned string to
 * the Agent seam with zero logic of its own.
 */
export function compilePersonaSystem(persona: Persona): string {
  return [
    `You write in the authentic voice of "${persona.name}".`,
    persona.voice ? `Voice: ${persona.voice}` : "",
    persona.voiceSample ? `Voice sample to match: ${persona.voiceSample}` : "",
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
