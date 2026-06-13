/**
 * The worker registry (R8 swappable agent / R11 second worker). Selecting a
 * worker is the "one-line swap": pick a `workerId` and the SAME `Agent`
 * interface is satisfied by a different model. The UI exposes these as a worker
 * picker and labels each produced page with the worker that built it.
 *
 * Models are Anthropic ids reached through the Vercel AI SDK provider
 * (`@ai-sdk/anthropic`); swapping `model` is all it takes to change the worker.
 */
export interface WorkerDescriptor {
  /** Stable, URL-safe id used by the API + UI picker. */
  id: string;
  /** Human-facing label for the run header / worker picker. */
  label: string;
  /** The underlying model id passed to the provider. */
  model: string;
}

/**
 * At least two real workers behind one interface (R11). Opus is the default
 * (most capable); Sonnet is the cheaper, faster second worker swapped mid-demo.
 */
export const AVAILABLE_WORKERS: readonly WorkerDescriptor[] = [
  { id: "opus", label: "Claude Opus 4.8", model: "claude-opus-4-8" },
  { id: "sonnet", label: "Claude Sonnet 4.6", model: "claude-sonnet-4-6" },
] as const;

/** The default real worker id when none is specified. */
export const DEFAULT_WORKER_ID = "opus";

/**
 * Resolve a (possibly undefined or unknown) workerId to a descriptor, falling
 * back to the default worker. Never throws — an unknown id quietly degrades to
 * the default so a stray query param can't break a run.
 */
export function resolveWorker(workerId: string | undefined): WorkerDescriptor {
  const found = AVAILABLE_WORKERS.find((w) => w.id === workerId);
  if (found) return found;
  const fallback = AVAILABLE_WORKERS.find((w) => w.id === DEFAULT_WORKER_ID);
  // The registry always contains DEFAULT_WORKER_ID (asserted by tests).
  return fallback ?? AVAILABLE_WORKERS[0]!;
}
