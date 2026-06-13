import type { Alarm, AlarmType, FinishReason, Phase } from "@publisher/shared";

/**
 * Pure mapping from worker outcomes (`finishReason` + thrown SDK errors) onto
 * the structured alarm inputs the Observability pillar (Pillar 4) emits. Living
 * in the agent module keeps the worker→alarm translation next to the only place
 * that knows the SDK's failure shapes, while the alarms themselves are emitted
 * (never thrown) per ASSUMPTIONS D7. Fully deterministic + unit-tested.
 */

/** Context threaded onto an alarm so the UI can attribute it to a phase/worker. */
export interface AgentAlarmContext {
  phase: Phase;
  /** Which worker produced the outcome (R8/R11) — optional. */
  workerId?: string;
}

/**
 * A thrown agent fault carrying an optional HTTP-ish status code so the mapper
 * can distinguish rate limits (429) from generic provider errors. SDK errors
 * are coerced through this where a status is known; plain `Error`s also work.
 */
export class AgentError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AgentError";
    this.status = status;
  }
}

function baseContext(
  ctx: AgentAlarmContext,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { phase: ctx.phase, ...extra };
  if (ctx.workerId !== undefined) out["workerId"] = ctx.workerId;
  return out;
}

/**
 * Map a generation's `finishReason` to an alarm, or `null` when the finish was
 * clean (`stop`) or not alarm-worthy on its own (`tool-calls`, `other`).
 *
 * - `refusal` / `content-filter` → REFUSAL (critical): the model declined.
 * - `length` → OUTPUT_TRUNCATED (warning): output hit the token ceiling.
 * - `error` → PROVIDER_ERROR (critical): the SDK reported a generation error.
 */
export function finishReasonToAlarm(
  finishReason: FinishReason,
  ctx: AgentAlarmContext,
): Alarm | null {
  switch (finishReason) {
    case "refusal":
    case "content-filter":
      return {
        type: "REFUSAL",
        severity: "critical",
        context: baseContext(ctx, { finishReason }),
        recommendedAction:
          "The worker refused or was content-filtered. Escalate for human review or adjust the concept/persona.",
      };
    case "length":
      return {
        type: "OUTPUT_TRUNCATED",
        severity: "warning",
        context: baseContext(ctx, { finishReason }),
        recommendedAction:
          "Output was truncated at the token limit. Raise max output tokens or narrow the build scope.",
      };
    case "error":
      return {
        type: "PROVIDER_ERROR",
        severity: "critical",
        context: baseContext(ctx, { finishReason }),
        recommendedAction:
          "The provider reported a generation error. Retry; if it persists, swap the worker.",
      };
    case "stop":
    case "tool-calls":
    case "other":
      return null;
  }
}

/** True when a thrown error looks like a provider rate limit (429 / message). */
function isRateLimited(err: unknown): boolean {
  if (err instanceof AgentError && err.status === 429) return true;
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("rate-limit") ||
    msg.includes("429") ||
    msg.includes("too many requests")
  );
}

/** Best-effort message extraction from any thrown value. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Map a thrown SDK/agent error onto an alarm. Rate limits become RATE_LIMITED
 * (critical); everything else becomes PROVIDER_ERROR (critical). Always returns
 * an alarm — a thrown error is, by definition, a fault worth surfacing.
 */
export function errorToAlarm(err: unknown, ctx: AgentAlarmContext): Alarm {
  const message = errorMessage(err);
  const type: AlarmType = isRateLimited(err)
    ? "RATE_LIMITED"
    : "PROVIDER_ERROR";
  const recommendedAction =
    type === "RATE_LIMITED"
      ? "The provider rate-limited the request. Back off and retry, or swap to a less-loaded worker."
      : "The worker call threw. Retry; if it persists, swap the worker or escalate.";
  return {
    type,
    severity: "critical",
    context: baseContext(ctx, { message }),
    recommendedAction,
  };
}
