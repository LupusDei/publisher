import type { Persona } from "@publisher/shared";

/**
 * Fixture personas for the Guardrail Compiler (Track B). Two deliberately
 * DIVERGENT personas power the "two-persona proof" (OVERVIEW ★ / R3): same
 * concept, different declared guardrails → different compiled output. A third
 * "sparse" persona exercises the empty-section edge case. designElements use
 * the FIXED vocabulary (palette/typography/layout/tone, ASSUMPTIONS D3).
 */

/** Persona A — warm, literary essayist. Serif, generous whitespace. */
export const essayist: Persona = {
  id: "p_essayist",
  name: "The Essayist",
  voice: "Measured, reflective, first-person. Long sentences that breathe.",
  voiceSample:
    "Emergence is not magic — it is only attention, paid slowly, until the pattern admits itself.",
  stylePoints: [
    "short paragraphs",
    "one concrete image per section",
    "avoid jargon",
  ],
  keyLearnings: [
    "readers trust specificity over abstraction",
    "open with a scene, not a thesis",
  ],
  designElements: {
    palette: "warm neutrals",
    typography: "serif",
    layout: "single-column generous-whitespace",
    tone: "contemplative",
  },
};

/** Persona B — punchy, technical operator. Sans-serif, dense grid. */
export const operator: Persona = {
  id: "p_operator",
  name: "The Operator",
  voice: "Blunt, imperative, second-person. Short declarative sentences.",
  voiceSample: "Ship it. Measure it. Cut what doesn't move the number.",
  stylePoints: [
    "lead with the action",
    "numbers over adjectives",
    "no hedging",
  ],
  keyLearnings: [
    "operators skim — front-load the takeaway",
    "every claim needs a metric",
  ],
  designElements: {
    palette: "high-contrast mono",
    typography: "sans-serif",
    layout: "dense-grid",
    tone: "urgent",
  },
};

/** Sparse persona — only the required fields populated (edge case). */
export const sparse: Persona = {
  id: "p_sparse",
  name: "Bare",
  voice: "",
  voiceSample: "a single sample line",
  stylePoints: [],
  keyLearnings: [],
  designElements: {},
};
