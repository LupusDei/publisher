/**
 * Domain interfaces — the harness's internal seams. Interfaces ONLY (no impl);
 * concrete implementations live in their owning track's directory. All payload
 * types come from `@publisher/shared` so every track agrees on the shapes
 * (ASSUMPTIONS D8). Alarms are RETURNED, never thrown (D7); true faults are
 * exceptions the orchestrator maps to alarms.
 */
import type {
  AgentResult,
  Alarm,
  Budget,
  CheckpointContext,
  CheckpointName,
  CheckpointResult,
  EscalationDecision,
  Material,
  MetricBreach,
  Metrics,
  Persona,
  Phase,
  Receipt,
  ResearchResult,
  RunEvent,
  Usage,
  Validator,
  Webpage,
} from "@publisher/shared";

// ── Agent (worker) — system in, AgentResult out (D2) ───────────────────────
export interface Agent {
  research(input: {
    system: string;
    concept: string;
  }): Promise<AgentResult<ResearchResult>>;
  build(input: {
    system: string;
    research: ResearchResult;
    feedback?: string;
  }): Promise<AgentResult<Webpage>>;
}

// ── Guardrails (Pillar 2) — owns the compiled persona ──────────────────────
export interface CompiledGuardrails {
  systemPrompt: string;
  validators: Validator[];
}
export interface GuardrailEngine {
  compile(persona: Persona): CompiledGuardrails;
}

// ── Checkpoints (Pillar 3) — rich context keeps the spine thin (D8) ────────
export interface Checkpoint {
  name: CheckpointName;
  kind: "deterministic" | "judge";
  evaluate(ctx: CheckpointContext): Promise<CheckpointResult>;
}

// ── Material (Pillar 1) — alarms returned, not thrown (D7) ──────────────────
export interface Source {
  load(
    concept: string,
    personaId: string,
  ): Promise<{ material?: Material; alarms: Alarm[] }>;
}
export interface Sink {
  publish(
    page: Webpage,
    meta: { runId: string; workerId: string },
  ): Promise<Receipt>;
}

// ── Observability & Alarms (Pillar 4) — per-run meter (D9) ─────────────────
export interface AgentError {
  phase: Phase;
  message: string;
}
export interface Meter {
  record(phase: Phase, s: { usage?: Usage; latencyMs: number }): void;
  snapshot(): Metrics;
}
export interface AlarmEmitter {
  evaluate(input: MetricBreach | CheckpointResult | AgentError): Alarm[];
  budget?: Budget;
}

// ── Run / journal / stream — log = source of truth (D5) ────────────────────
export interface Journal {
  append(e: RunEvent): void;
  load(runId: string): RunEvent[];
  loadSince(runId: string, seq: number): RunEvent[];
  replayFrom(runId: string): {
    fromCheckpoint: CheckpointName;
    priorOutputs: {
      research?: ResearchResult;
      lastWebpage?: Webpage;
      passedCheckpoints: CheckpointName[];
    };
  };
}
export interface RunEngine {
  start(material: Material, workerId: string): AsyncIterable<RunEvent>;
  resume(runId: string, decision: EscalationDecision): AsyncIterable<RunEvent>;
}
