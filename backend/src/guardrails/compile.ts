import type { Persona } from "@publisher/shared";
import { DESIGN_TOKEN_VOCABULARY, type DesignTokenKey } from "./vocabulary.js";

/**
 * Compile a persona into a system-prompt fragment — the PREVENTIVE half of the
 * Guardrails pillar (Pillar 2). This was relocated out of the worker
 * (ASSUMPTIONS D2); Track B enriches it into a sectioned, deterministic brief
 * that shapes the agent's FIRST attempt from the declared voice, style points,
 * key learnings, the voiceSample (as an exemplar to imitate), and the fixed
 * design-token vocabulary (D3). The orchestrator passes the returned string
 * straight to the Agent seam with zero logic of its own.
 *
 * Determinism: same persona → byte-identical output. Totality: never throws,
 * even for a sparse persona (empty sections are omitted, not emitted blank) —
 * this is what makes recompile-on-enrich (D19) safe to re-run.
 *
 * The named export `compilePersonaSystem` is load-bearing — server.ts and the
 * walking-skeleton wiring import it. Keep the name stable.
 */
export function compilePersonaSystem(persona: Persona): string {
  const sections: string[] = [];

  // ── Identity + voice ──────────────────────────────────────────────────────
  const intro = [`You write in the authentic voice of "${persona.name}".`];
  if (persona.voice.trim()) intro.push(`Voice: ${persona.voice.trim()}`);
  sections.push(intro.join("\n"));

  // ── Voice exemplar — the sample the voice-fidelity checkpoint judges against ─
  // A clearly framed block AND the legacy "Voice sample to match:" line, so the
  // checkpoints and downstream string matchers stay stable.
  if (persona.voiceSample.trim()) {
    sections.push(
      [
        "## VOICE EXEMPLAR — imitate the rhythm and diction of this sample:",
        `Voice sample to match: ${persona.voiceSample.trim()}`,
      ].join("\n"),
    );
  }

  // ── Style points ──────────────────────────────────────────────────────────
  if (persona.stylePoints.length) {
    sections.push(
      [
        `## Style points: ${persona.stylePoints.join("; ")}`,
        ...persona.stylePoints.map((p) => `- ${p}`),
      ].join("\n"),
    );
  }

  // ── Key learnings ─────────────────────────────────────────────────────────
  if (persona.keyLearnings.length) {
    sections.push(
      [
        `## Key learnings to draw on: ${persona.keyLearnings.join("; ")}`,
        ...persona.keyLearnings.map((l) => `- ${l}`),
      ].join("\n"),
    );
  }

  // ── Design system (fixed vocabulary, D3) ──────────────────────────────────
  const designLines = compileDesignLines(persona.designElements);
  if (designLines.length) {
    sections.push(["## Design system:", ...designLines].join("\n"));
  }

  return sections.join("\n\n");
}

/**
 * Render the persona's declared design tokens in the fixed-vocabulary canonical
 * order. Each line is `- palette=warm neutrals` (key=value) so two personas
 * diverge predictably and the output stays deterministic regardless of object
 * insertion order. Unknown keys (should not occur given D3, but personas are a
 * boundary) are appended last, sorted, keeping the function total.
 */
function compileDesignLines(designElements: Record<string, string>): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const key of DESIGN_TOKEN_VOCABULARY) {
    const value = designElements[key];
    if (value && value.trim()) {
      lines.push(`- ${key}=${value.trim()}`);
      seen.add(key);
    }
  }

  const extras = Object.keys(designElements)
    .filter((k) => !seen.has(k) && !isVocabularyKey(k))
    .sort();
  for (const key of extras) {
    const value = designElements[key];
    if (value && value.trim()) lines.push(`- ${key}=${value.trim()}`);
  }

  return lines;
}

function isVocabularyKey(key: string): key is DesignTokenKey {
  return (DESIGN_TOKEN_VOCABULARY as readonly string[]).includes(key);
}
