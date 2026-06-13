import type { Alarm, Material } from "@publisher/shared";
import type { Source } from "../domain/index.js";
import type { PersonaStore } from "../stores/persona.store.js";

/**
 * Minimum trimmed length a concept must have to be considered non-thin. A single
 * character (or pure whitespace) cannot drive a research→build run, so it is
 * treated as empty input and surfaced as an `INPUT_EMPTY` alarm (D7).
 */
const MIN_CONCEPT_LENGTH = 2;

/** Build the warning alarm Source returns instead of throwing (ASSUMPTIONS D7). */
function inputEmptyAlarm(
  context: Record<string, unknown>,
  recommendedAction: string,
): Alarm {
  return {
    type: "INPUT_EMPTY",
    severity: "warning",
    context,
    recommendedAction,
  };
}

/**
 * Material-Handling Source (Pillar 1). `load` validates the concept, loads the
 * persona via the injected `PersonaStore`, and assembles a `Material`. It NEVER
 * throws for bad input — empty/thin concepts and missing personas come back as
 * returned `INPUT_EMPTY` warnings with no material (D7). The orchestrator
 * forwards those alarms to the journal + stream.
 */
export function createSource(personas: PersonaStore): Source {
  return {
    async load(concept, personaId) {
      const trimmed = concept.trim();

      if (trimmed.length < MIN_CONCEPT_LENGTH) {
        return {
          alarms: [
            inputEmptyAlarm(
              { personaId, conceptLength: trimmed.length },
              "Provide a non-empty concept describing what to publish.",
            ),
          ],
        };
      }

      const persona = personas.getById(personaId);
      if (persona === null) {
        return {
          alarms: [
            inputEmptyAlarm(
              { personaId, concept: trimmed },
              `No persona found for id "${personaId}"; pick an existing persona before starting a run.`,
            ),
          ],
        };
      }

      const material: Material = { concept: trimmed, persona };
      return { material, alarms: [] };
    },
  };
}
