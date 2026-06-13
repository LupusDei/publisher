import type { Persona } from "@publisher/shared";
import type { CompiledGuardrails, GuardrailEngine } from "../domain/index.js";
import { compilePersonaSystem } from "./compile.js";
import { buildValidators } from "./validators.js";

/**
 * GuardrailEngine — the integration seam of Pillar 2. Joins the PREVENTIVE half
 * (`compilePersonaSystem`) and the DETECTIVE half (`buildValidators`) into the
 * single `compile(persona) → { systemPrompt, validators }` the domain interface
 * declares. "Declared once, enforced twice."
 *
 * `compile()` is total and re-runnable (D19) so escalation's enrich-persona step
 * can recompile before resuming. `describe()` is the inspection projection that
 * powers the R3 compiled-guardrail panel — validators rendered as data (rule +
 * human description) instead of serialized functions.
 */

/** A validator rendered as inspectable data (no function leaks to the wire). */
export interface ValidatorDescription {
  rule: string;
  kind: "deterministic";
  description: string;
}

export interface CompiledGuardrailsView {
  systemPrompt: string;
  validators: ValidatorDescription[];
}

export interface PublisherGuardrailEngine extends GuardrailEngine {
  /** Inspection projection for the R3 panel — JSON-safe, no functions. */
  describe(persona: Persona): CompiledGuardrailsView;
}

/**
 * Static catalogue describing each validator the engine attaches. Kept here (not
 * derived from the functions) so the description is stable, human-readable, and
 * decoupled from the implementation details of `validators.ts`.
 */
const VALIDATOR_CATALOGUE: ValidatorDescription[] = [
  {
    rule: "design-token",
    kind: "deterministic",
    description:
      "Checks the persona's declared design tokens (typography, layout, palette — the fixed vocabulary) are reflected in the page's CSS/markup.",
  },
  {
    rule: "banned-phrase",
    kind: "deterministic",
    description:
      "Asserts the page contains no character-leak/meta phrasing (e.g. 'As an AI', 'system prompt') nor any persona-declared banned phrases.",
  },
  {
    rule: "structure",
    kind: "deterministic",
    description:
      "Verifies basic publishable structure: a non-empty title, an <h1> heading, and a minimum body-text length.",
  },
];

export function createGuardrailEngine(): PublisherGuardrailEngine {
  return {
    compile(persona: Persona): CompiledGuardrails {
      return {
        systemPrompt: compilePersonaSystem(persona),
        validators: buildValidators(persona),
      };
    },

    describe(persona: Persona): CompiledGuardrailsView {
      return {
        systemPrompt: compilePersonaSystem(persona),
        validators: VALIDATOR_CATALOGUE.map((v) => ({ ...v })),
      };
    },
  };
}

export { compilePersonaSystem } from "./compile.js";
export { buildValidators } from "./validators.js";
