/**
 * Typed client for the run endpoints (Track H, the proof surface). Kept in the
 * runs route tree so it does not touch the shared lib/api.ts or Track A's
 * persona-api.ts. Mirrors the backend run contract; the base URL comes from
 * NEXT_PUBLIC_API_BASE so the same build points at a local or deployed backend.
 *
 * The RunEvent / Receipt / Escalation / Persona shapes are re-used from
 * @publisher/shared so the wire contract and the UI never drift.
 */
import type {
  RunEvent,
  Run,
  Receipt,
  EscalationOption,
  Persona,
} from "@publisher/shared";
// authFetch attaches the persisted JWT as `Authorization: Bearer <token>` so
// every authenticated run call carries the session (85q.5).
import { authFetch, readToken } from "../auth/auth-api";

export const RUN_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

/** A worker the user can pick (mirror of backend AVAILABLE_WORKERS / R11). */
export interface WorkerOption {
  id: string;
  label: string;
  model: string;
}

/**
 * The worker registry the picker offers (R11). Mirrored statically so the
 * picker renders without a round-trip; the backend remains the source of truth
 * and silently falls back to its default for any unknown id.
 */
export const AVAILABLE_WORKERS: readonly WorkerOption[] = [
  { id: "opus", label: "Claude Opus 4.8", model: "claude-opus-4-8" },
  { id: "sonnet", label: "Claude Sonnet 4.6", model: "claude-sonnet-4-6" },
  // Multi-provider build workers via the Vercel AI Gateway (backend `gateway`
  // impl). Mirror of backend AVAILABLE_WORKERS — keep the two in sync.
  { id: "gpt5", label: "GPT-5.4 (via AI Gateway)", model: "openai/gpt-5.4" },
  {
    id: "gemini",
    label: "Gemini 2.5 Pro (via AI Gateway)",
    model: "google/gemini-2.5-pro",
  },
  {
    id: "anthropic-research",
    label: "Claude Sonnet 4.6 · real web research",
    model: "claude-sonnet-4-6",
  },
] as const;

/**
 * The BUILD models the run-form picker offers (rrt.6). Research always runs on
 * the fixed web-research worker server-side, so the picker only chooses who
 * BUILDS the page — the non-building `anthropic-research` worker is excluded.
 * `AVAILABLE_WORKERS` stays complete for labelling historical runs.
 */
export const BUILDER_WORKERS: readonly WorkerOption[] = AVAILABLE_WORKERS.filter(
  (w) => w.id !== "anthropic-research",
);

/** Default BUILD model (Opus is the most capable). */
export const DEFAULT_WORKER_ID = "opus";

/** POST /runs input. `workerId` is optional (R11); backend defaults it. */
export interface StartRunInput {
  personaId: string;
  concept: string;
  workerId?: string;
}

interface ApiErrorBody {
  error?: { message?: string; issues?: { path: string; message: string }[] };
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body.error?.issues && body.error.issues.length > 0) {
      return body.error.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
    }
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** POST /runs → { runId }. Some backends also echo a receipt; we ignore it. */
export async function startRun(
  input: StartRunInput,
  base: string = RUN_API_BASE,
): Promise<{ runId: string }> {
  const res = await authFetch(`${base}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      await readError(res, `Failed to start run (HTTP ${res.status})`),
    );
  }
  const body = (await res.json()) as { runId: string };
  return { runId: body.runId };
}

/** GET /runs/:id → the run header/summary row. */
export async function fetchRun(
  runId: string,
  base: string = RUN_API_BASE,
): Promise<Run> {
  const res = await authFetch(`${base}/runs/${runId}`);
  if (!res.ok) {
    throw new Error(`Failed to load run (HTTP ${res.status})`);
  }
  return (await res.json()) as Run;
}

/**
 * GET /runs → the list of runs (for the runs list / replay surface, R9). The
 * backend returns a BARE array (its integration test asserts `Array.isArray`);
 * we tolerate a `{ runs }` envelope too and ALWAYS resolve to an array so the
 * caller never sets state to `undefined` (which crashed the page at
 * `runs.length`).
 */
export async function fetchRuns(base: string = RUN_API_BASE): Promise<Run[]> {
  const res = await authFetch(`${base}/runs`);
  if (!res.ok) {
    throw new Error(`Failed to load runs (HTTP ${res.status})`);
  }
  const body = (await res.json()) as Run[] | { runs?: Run[] };
  if (Array.isArray(body)) return body;
  return body.runs ?? [];
}

/**
 * GET /runs/:id/events?sinceSeq=N → ordered RunEvent[] (catch-up / replay).
 * The backend wraps them as `{ events }`; we unwrap to the bare array.
 */
export async function fetchRunEvents(
  runId: string,
  sinceSeq = -1,
  base: string = RUN_API_BASE,
): Promise<RunEvent[]> {
  const qs = sinceSeq >= 0 ? `?sinceSeq=${sinceSeq}` : "";
  const res = await authFetch(`${base}/runs/${runId}/events${qs}`);
  if (!res.ok) {
    throw new Error(`Failed to load run events (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { events: RunEvent[] };
  return body.events;
}

/** POST /runs/:id/decision → resume a paused (escalated) run (R10). */
export async function postDecision(
  runId: string,
  decision: { choice: EscalationOption; payload?: { persona?: Persona } },
  base: string = RUN_API_BASE,
): Promise<void> {
  const res = await authFetch(`${base}/runs/${runId}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(decision),
  });
  if (!res.ok) {
    throw new Error(
      await readError(res, `Failed to submit decision (HTTP ${res.status})`),
    );
  }
}

/** Minimal persona shape the start-run picker needs (id + name + voice). */
export interface PersonaSummary {
  id: string;
  name: string;
  voice?: string;
  voiceSample?: string;
}

/**
 * GET /personas → persona summaries for the start-run picker (R1 input). Kept
 * here (not imported from Track A's persona-api) so the runs tree stays
 * self-contained; the backend wraps the list as `{ personas }`.
 */
export async function fetchPersonaSummaries(
  base: string = RUN_API_BASE,
): Promise<PersonaSummary[]> {
  const res = await authFetch(`${base}/personas`);
  if (!res.ok) {
    throw new Error(`Failed to load personas (HTTP ${res.status})`);
  }
  // Tolerate both the {personas} envelope (the real backend shape) and a bare
  // array, always resolving to an array so the picker never sees `undefined`
  // (mirrors fetchRuns — publisher-runsenv).
  const body = (await res.json()) as
    | PersonaSummary[]
    | { personas?: PersonaSummary[] };
  if (Array.isArray(body)) return body;
  return body.personas ?? [];
}

/** A validator rendered as inspectable data (mirror of the backend view). */
export interface ValidatorDescription {
  rule: string;
  kind: string;
  description: string;
}

/** The compiled-guardrail projection powering the R3 panel. */
export interface CompiledGuardrailsView {
  systemPrompt: string;
  validators: ValidatorDescription[];
}

/** GET /personas/:id/compiled → the "declared → compiled" proof (R3). */
export async function fetchCompiledGuardrails(
  personaId: string,
  base: string = RUN_API_BASE,
): Promise<CompiledGuardrailsView> {
  const res = await authFetch(`${base}/personas/${personaId}/compiled`);
  if (!res.ok) {
    throw new Error(`Failed to load compiled guardrails (HTTP ${res.status})`);
  }
  return (await res.json()) as CompiledGuardrailsView;
}

/** The absolute URL of a published page (for the preview iframe). */
export function publishedUrl(
  receipt: Pick<Receipt, "url"> | string,
  base: string = RUN_API_BASE,
): string {
  const url = typeof receipt === "string" ? receipt : receipt.url;
  // Receipts may carry an absolute URL already (deployed) or a relative path.
  if (/^https?:\/\//.test(url)) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * The SSE stream URL, with an optional reconnect cursor (D5) and — when the
 * router is auth-gated — the session JWT as a `?token=` query param. Browser
 * EventSource can't set an Authorization header (publisher-2aa), so the token
 * rides in the query string; the backend verifies it the same way requireAuth
 * verifies the header. No stored token → no `token` param, preserving the
 * opt-in / public-stream behavior.
 */
export function streamUrl(
  runId: string,
  sinceSeq?: number,
  base: string = RUN_API_BASE,
): string {
  const params = new URLSearchParams();
  if (typeof sinceSeq === "number" && sinceSeq >= 0) {
    params.set("sinceSeq", String(sinceSeq));
  }
  const token = readToken();
  if (token) params.set("token", token);
  const qs = params.toString();
  return `${base}/runs/${runId}/stream${qs ? `?${qs}` : ""}`;
}
