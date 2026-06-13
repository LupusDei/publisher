import type {
  Alarm,
  Checkpoint,
  CheckpointContext,
  CheckpointResult,
  Persona,
  Validator,
  ValidatorFinding,
  Webpage,
} from "@publisher/shared";

/**
 * Gate 3 — DESIGN CONFORMANCE (deterministic, validator-driven). Runs the
 * persona's DETECTIVE validators (the Guardrails pillar's compiled output) over
 * the built page and folds their findings into a pass/fail.
 *
 * We DO NOT hard-depend on Track B: a `ValidatorsProvider` is injected via deps.
 * The default provider returns NO validators, so the gate passes vacuously and
 * the pipe stays green until Track B's `GuardrailEngine.compile()` is wired in
 * by the orchestrator (the integration seam, dp0.5.1).
 *
 * Threshold: ALL findings must pass (score = fraction passing; pass iff 1.0).
 */

/** Supplies the detective validators for a persona — the Guardrails seam. */
export type ValidatorsProvider = (persona: Persona) => Validator[];

/** Default: no validators (stub) — the gate passes until Track B is wired. */
const noValidators: ValidatorsProvider = () => [];

export interface DesignConformanceDeps {
  /** Injectable validators provider; defaults to a no-op stub (no Track B dep). */
  validators?: ValidatorsProvider;
}

function runValidators(
  validators: Validator[],
  page: Webpage,
  persona: Persona,
): ValidatorFinding[] {
  return validators.flatMap((v) => v(page, persona));
}

export function designConformance(
  deps: DesignConformanceDeps = {},
): Checkpoint {
  const provider = deps.validators ?? noValidators;

  return {
    name: "design-conformance",
    kind: "deterministic",
    async evaluate(ctx: CheckpointContext): Promise<CheckpointResult> {
      const validators = provider(ctx.persona);

      // Nothing to check (no page yet, or no compiled validators): pass vacuously.
      if (!ctx.webpage || validators.length === 0) {
        return {
          name: "design-conformance",
          passed: true,
          score: 1,
          threshold: 1,
          details: !ctx.webpage
            ? "No webpage to validate yet — design gate passes vacuously."
            : "No validators provided — design gate passes vacuously (stub).",
          autoCorrectable: false,
          alarms: [],
        };
      }

      const findings = runValidators(validators, ctx.webpage, ctx.persona);
      const total = findings.length;
      const failed = findings.filter((f) => !f.passed);
      // No findings emitted at all ⇒ treat as a clean pass.
      const score = total === 0 ? 1 : (total - failed.length) / total;
      const passed = failed.length === 0;

      if (passed) {
        return {
          name: "design-conformance",
          passed: true,
          score,
          threshold: 1,
          details: `Design conformant: ${total} validator finding(s), all passed.`,
          autoCorrectable: false,
          alarms: [],
        };
      }

      const failedRules = failed.map((f) => f.rule);
      const alarm: Alarm = {
        type: "DESIGN_DRIFT",
        severity: "warning",
        context: { failedRules, score, threshold: 1 },
        recommendedAction:
          "Bring the page back into the declared design vocabulary for the failed rules.",
      };
      return {
        name: "design-conformance",
        passed: false,
        score,
        threshold: 1,
        details: `Design drift on ${failed.length}/${total} rule(s): ${failedRules.join(
          ", ",
        )}.`,
        autoCorrectable: true,
        feedback: `Fix these design rules: ${failed
          .map((f) => `${f.rule} (${f.detail})`)
          .join("; ")}.`,
        alarms: [alarm],
      };
    },
  };
}
