/**
 * The worker registry (R8 swappable agent / R11 second worker). Selecting a
 * worker is the "one-line swap": pick a `workerId` and the SAME `Agent`
 * interface is satisfied by a different model. The UI exposes these as a worker
 * picker and labels each produced page with the worker that built it.
 *
 * Models are Anthropic ids reached through the Vercel AI SDK provider
 * (`@ai-sdk/anthropic`); swapping `model` is all it takes to change the worker.
 */
/**
 * Which concrete `Agent` implementation backs a worker.
 *   - `vercel-ai-sdk` → `AnthropicAgent` (`ai` + `@ai-sdk/anthropic`); NO web
 *     tools, so research sources are empty (the original real worker).
 *   - `anthropic-research` → `AnthropicResearchAgent` (official
 *     `@anthropic-ai/sdk` + server-side `web_search`); REAL sources (D13).
 * Two genuinely-different implementations behind ONE seam = the R8/R11 swap.
 */
export type WorkerImpl =
  | "vercel-ai-sdk"
  | "anthropic-research"
  | "gateway";

export interface WorkerDescriptor {
  /** Stable, URL-safe id used by the API + UI picker. */
  id: string;
  /** Human-facing label for the run header / worker picker. */
  label: string;
  /** The underlying model id passed to the provider. */
  model: string;
  /** Which concrete Agent implementation builds this worker. */
  impl: WorkerImpl;
}

/**
 * At least two real workers behind one interface (R11). Opus is the default
 * (most capable); Sonnet is the cheaper, faster second worker swapped mid-demo;
 * `anthropic-research` is the REAL-web-search worker (D13) — a third,
 * genuinely-different implementation that returns real source URLs.
 */
export const AVAILABLE_WORKERS: readonly WorkerDescriptor[] = [
  {
    id: "opus",
    label: "Claude Opus 4.8",
    model: "claude-opus-4-8",
    impl: "vercel-ai-sdk",
  },
  {
    id: "sonnet",
    label: "Claude Sonnet 4.6",
    model: "claude-sonnet-4-6",
    impl: "vercel-ai-sdk",
  },
  {
    id: "anthropic-research",
    label: "Claude Sonnet 4.6 (real web research)",
    model: "claude-sonnet-4-6",
    impl: "anthropic-research",
  },
  // Multi-provider build workers via the Vercel AI Gateway (one
  // AI_GATEWAY_API_KEY reaches every provider). `model` is a gateway
  // `provider/model` slug — verify exact ids against the gateway's model
  // catalog; adding more is a one-line descriptor each.
  {
    id: "gpt5",
    label: "GPT-5.4 (via AI Gateway)",
    model: "openai/gpt-5.4",
    impl: "gateway",
  },
  {
    id: "gemini",
    label: "Gemini 2.5 Pro (via AI Gateway)",
    model: "google/gemini-2.5-pro",
    impl: "gateway",
  },
] as const;

/** The default BUILD worker id when none is specified (rrt.6: the picker
 * chooses the builder; Opus is the most capable default). */
export const DEFAULT_WORKER_ID = "opus";

/**
 * The fixed RESEARCH worker (rrt.6). Research ALWAYS runs through this worker
 * (real `web_search`/`web_fetch`) regardless of the build model the user picks,
 * so every run gathers real sources while the picker only selects who builds.
 */
export const RESEARCH_WORKER_ID = "anthropic-research";

/** The selectable BUILD models the run-form picker offers (rrt.6) — every
 * worker EXCEPT the fixed web-research worker (which always runs server-side and
 * is never a build choice). Build workers may be any provider-backed impl
 * (`vercel-ai-sdk` direct-Anthropic, or `gateway` multi-provider). */
export const BUILDER_WORKERS: readonly WorkerDescriptor[] =
  AVAILABLE_WORKERS.filter((w) => w.impl !== "anthropic-research");

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
