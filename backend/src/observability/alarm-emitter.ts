import type {
  Alarm,
  AlarmSeverity,
  AlarmType,
  Budget,
  CheckpointName,
  CheckpointResult,
  MetricBreach,
} from "@publisher/shared";
import type { AgentError, AlarmEmitter } from "../domain/index.js";

/**
 * AlarmEmitter (Pillar 4, R5). Turns the three alarm-bearing inputs into
 * structured `Alarm`s with an EXACT named type + severity + context +
 * recommendedAction. Alarms are RETURNED, never thrown (ASSUMPTIONS D7): the
 * orchestrator collects what we return and forwards them to journal + store.
 *
 * Severity convention:
 *  - budget breaches are `warning` (the run can continue / be cut short),
 *  - checkpoint failures are `warning` when auto-correctable, else `critical`
 *    (a hard gate failure escalates),
 *  - agent errors are `critical` (a true fault the orchestrator maps from an
 *    exception per D7).
 */

/** Failed-checkpoint name → alarm type. A passed checkpoint emits nothing. */
const CHECKPOINT_ALARM: Record<CheckpointName, AlarmType> = {
  "research-sufficiency": "INSUFFICIENT_RESEARCH",
  "voice-fidelity": "VOICE_DRIFT",
  "design-conformance": "DESIGN_DRIFT",
  quality: "INSUFFICIENT_QUALITY",
};

/** Heuristic message classifiers for an agent error → named alarm type. */
const AGENT_ERROR_CLASSIFIERS: ReadonlyArray<{
  type: AlarmType;
  test: RegExp;
}> = [
  { type: "RATE_LIMITED", test: /rate.?limit|429|too many requests/i },
  { type: "REFUSAL", test: /refus|declined to|cannot comply/i },
  { type: "OUTPUT_TRUNCATED", test: /truncat|max(imum)? length|length limit/i },
  {
    type: "WEBPAGE_GENERATION_FAILED",
    test: /webpage|html generation|page (generation|build)/i,
  },
];

function isMetricBreach(
  input: MetricBreach | CheckpointResult | AgentError,
): input is MetricBreach {
  return (
    "kind" in input && (input.kind === "token" || input.kind === "latency")
  );
}

function isCheckpointResult(
  input: MetricBreach | CheckpointResult | AgentError,
): input is CheckpointResult {
  return "name" in input && "passed" in input;
}

function breachAlarm(breach: MetricBreach): Alarm {
  if (breach.kind === "token") {
    return {
      type: "TOKEN_BUDGET_EXCEEDED",
      severity: "warning",
      context: {
        observed: breach.observed,
        limit: breach.limit,
        ...(breach.phase ? { phase: breach.phase } : {}),
      },
      recommendedAction:
        "Token budget exceeded — narrow the concept, trim research, or raise maxTokens for this run.",
    };
  }
  return {
    type: "HIGH_LATENCY",
    severity: "warning",
    context: {
      observed: breach.observed,
      limit: breach.limit,
      ...(breach.phase ? { phase: breach.phase } : {}),
    },
    recommendedAction:
      "Latency budget exceeded — check provider responsiveness or raise maxLatencyMs.",
  };
}

function checkpointAlarm(result: CheckpointResult): Alarm[] {
  if (result.passed) return [];
  const type = CHECKPOINT_ALARM[result.name];
  const severity: AlarmSeverity = result.autoCorrectable
    ? "warning"
    : "critical";
  const action = result.feedback
    ? `Apply feedback and retry: ${result.feedback}`
    : result.autoCorrectable
      ? "Auto-correct with checkpoint feedback and retry the draft."
      : "Hard gate failed — escalate for human guidance or enrichment.";
  return [
    {
      type,
      severity,
      context: {
        checkpoint: result.name,
        details: result.details,
        ...(result.score !== undefined ? { score: result.score } : {}),
        ...(result.threshold !== undefined
          ? { threshold: result.threshold }
          : {}),
        autoCorrectable: result.autoCorrectable,
      },
      recommendedAction: action,
    },
  ];
}

function agentErrorAlarm(err: AgentError): Alarm {
  const classified = AGENT_ERROR_CLASSIFIERS.find((c) =>
    c.test.test(err.message),
  );
  const type: AlarmType = classified ? classified.type : "PROVIDER_ERROR";
  return {
    type,
    severity: "critical",
    context: { phase: err.phase, message: err.message },
    recommendedAction:
      type === "RATE_LIMITED"
        ? "Back off and retry after the provider's cooldown."
        : type === "REFUSAL"
          ? "Adjust the prompt/guardrails; the model refused this request."
          : type === "OUTPUT_TRUNCATED"
            ? "Increase output budget or split the generation into smaller steps."
            : "Provider/agent fault — retry the phase; escalate if it persists.",
  };
}

export function createAlarmEmitter(budget?: Budget): AlarmEmitter {
  const evaluate = (
    input: MetricBreach | CheckpointResult | AgentError,
  ): Alarm[] => {
    if (isMetricBreach(input)) return [breachAlarm(input)];
    if (isCheckpointResult(input)) return checkpointAlarm(input);
    return [agentErrorAlarm(input)];
  };
  // `exactOptionalPropertyTypes` is on: only attach `budget` when declared,
  // rather than setting it to `undefined`.
  return budget === undefined ? { evaluate } : { evaluate, budget };
}
