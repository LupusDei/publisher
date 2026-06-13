import { randomUUID } from "node:crypto";
import type { Material, Receipt, RunEvent } from "@publisher/shared";
import type { Agent, Sink } from "../domain/index.js";
import type { PersonaStore } from "../stores/persona.store.js";
import type { RunStore } from "../stores/run.store.js";
import type { RunEventStore } from "../stores/run-event.store.js";
import type { WebpageStore } from "../stores/webpage.store.js";
import { runSkeleton } from "../orchestrator/skeleton.js";

/** Raised when a referenced persona does not exist — mapped to a 404 by routes. */
export class PersonaNotFoundError extends Error {
  constructor(public readonly personaId: string) {
    super(`Persona ${personaId} not found`);
    this.name = "PersonaNotFoundError";
  }
}

export interface RunServiceDeps {
  agent: Agent;
  sink: Sink;
  personaStore: PersonaStore;
  runStore: RunStore;
  eventStore: RunEventStore;
  webpageStore: WebpageStore;
  compileSystem: (material: Material) => string;
  newRunId?: () => string;
}

export interface RunService {
  start(input: {
    personaId: string;
    concept: string;
  }): Promise<{ runId: string; receipt: Receipt }>;
  events(runId: string): RunEvent[];
}

/**
 * Run service — the layer between the runs route and the orchestrator/stores
 * (Constitution Rule 4). For the skeleton it drives `runSkeleton` to completion
 * synchronously; Track G replaces this with the streaming RunEngine.
 */
export function createRunService(deps: RunServiceDeps): RunService {
  const newRunId = deps.newRunId ?? (() => `run_${randomUUID()}`);

  return {
    async start({ personaId, concept }) {
      const persona = deps.personaStore.getById(personaId);
      if (!persona) {
        throw new PersonaNotFoundError(personaId);
      }
      const material: Material = { concept, persona };
      const runId = newRunId();
      const { receipt } = await runSkeleton(
        {
          agent: deps.agent,
          sink: deps.sink,
          runStore: deps.runStore,
          eventStore: deps.eventStore,
          webpageStore: deps.webpageStore,
          compileSystem: deps.compileSystem,
        },
        { runId, material, workerId: "mock" },
      );
      return { runId, receipt };
    },

    events(runId) {
      return deps.eventStore.load(runId);
    },
  };
}
