import type {
  Material,
  Receipt,
  RunEvent,
  CheckpointResult,
} from "@publisher/shared";
import type { Agent, Sink } from "../domain/index.js";
import type { RunStore } from "../stores/run.store.js";
import type { RunEventStore } from "../stores/run-event.store.js";
import type { WebpageStore } from "../stores/webpage.store.js";

/**
 * The WALKING SKELETON (ASSUMPTIONS D1). The thinnest possible run loop:
 * research → build → ONE trivial always-pass checkpoint → publish, appending
 * phase/draft/checkpoint/published RunEvents with monotonic seq to the
 * authoritative journal. NO real pillar logic — that is Tracks B–F. This is the
 * pipe the CI smoke gate keeps green; pillars thicken a working pipe.
 */

export interface SkeletonDeps {
  agent: Agent;
  sink: Sink;
  runStore: RunStore;
  eventStore: RunEventStore;
  webpageStore: WebpageStore;
  /** Compiles the persona into a system string (Guardrails seam; trivial here). */
  compileSystem: (material: Material) => string;
}

export interface SkeletonInput {
  runId: string;
  material: Material;
  workerId: string;
}

export interface SkeletonResult {
  receipt: Receipt;
}

export async function runSkeleton(
  deps: SkeletonDeps,
  input: SkeletonInput,
  now: () => string = () => new Date().toISOString(),
): Promise<SkeletonResult> {
  const { agent, sink, runStore, eventStore, webpageStore, compileSystem } =
    deps;
  const { runId, material, workerId } = input;

  let seq = 0;
  // Distribute Omit across the union so each variant keeps its own field set
  // (a plain Omit<RunEvent, ...> collapses the union and breaks excess-property
  // checks). `EventBody` is "any variant minus the envelope fields".
  type EventBody = RunEvent extends infer V
    ? V extends RunEvent
      ? Omit<V, "runId" | "seq" | "ts">
      : never
    : never;
  const emit = (body: EventBody): void => {
    const event = {
      runId,
      seq: seq++,
      ts: now(),
      ...body,
    } as RunEvent;
    eventStore.append(event);
  };

  const system = compileSystem(material);

  // Create the run header row (satisfies the run_events / webpages FK).
  runStore.create({
    id: runId,
    personaId: material.persona.id,
    concept: material.concept,
    workerId,
  });

  // RESEARCH
  runStore.updateStatus(runId, "researching");
  emit({ t: "phase", phase: "research" });
  const research = await agent.research({ system, concept: material.concept });

  // BUILD
  runStore.updateStatus(runId, "building");
  emit({ t: "phase", phase: "build" });
  const built = await agent.build({ system, research: research.value });
  const webpage = built.value;
  emit({ t: "draft", attempt: 1, webpage, passed: true });

  // CHECK — one trivial always-pass gate (skeleton scope; Track D thickens).
  runStore.updateStatus(runId, "checking");
  const result: CheckpointResult = {
    name: "quality",
    passed: true,
    details: "Skeleton trivial gate — always passes.",
    autoCorrectable: false,
    alarms: [],
  };
  emit({ t: "checkpoint", pillar: "checkpoints", result });

  // PUBLISH
  webpageStore.insert(runId, 1, webpage, true);
  const receipt = await sink.publish(webpage, { runId, workerId });
  emit({ t: "published", pillar: "material", receipt });
  runStore.updateStatus(runId, "published");

  return { receipt };
}
