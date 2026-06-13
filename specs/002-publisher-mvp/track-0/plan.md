# Plan — Track 0: Contracts, Schema & Walking Skeleton

> How to build the barrier. Phases map to the existing `publisher-dp0.1.x` beads.

## Architecture Notes
- **Contracts are the source of truth** (`shared/src/contracts/`): Zod schemas + inferred types, validated at boundaries (Rule 2). Cross-pillar types live here so no track redefines them.
- **The Agent imports no pillar.** It receives a compiled `system: string`. `GuardrailEngine.compile()` (Track B) produces that string; the orchestrator passes it through with zero logic.
- **Telemetry rides every agent call.** `AgentResult<T> = { value, usage, finishReason }` — Observability (E) and the error alarms depend on it.
- **`run_events` is the event log.** Append-only, monotonic `seq` per run. WS = live tail; reconnect/replay = `loadSince(runId, seq)`. Other tables are projections.
- **Alarms are returned, not thrown** (D7). Faults (provider/checkpoint errors) are exceptions mapped to alarms by the orchestrator.
- **Router registry** (D18): `createApp({ routers })` composes `{ path, router }[]` so A/G append, never edit shared lines.
- **Layered (Rule 4):** routes → services → stores; stores own SQLite; domain interfaces in `backend/src/domain/`.
- **Mock-first (Rule 8):** the skeleton uses `MockAgent` + one trivial checkpoint + a real `Sink`. No network, no judge.

## Target Layout (new/changed)
```
shared/src/contracts/
  persona.ts        (CHANGE: + voiceSample)
  metrics.ts        (NEW: Usage, FinishReason, Phase, Metrics, MetricBreach, Budget, AgentResult<T>)
  material.ts       (NEW: Material, Receipt)
  validator.ts      (NEW: Validator, ValidatorFinding)
  checkpoint.ts     (NEW: CheckpointName, CheckpointResult, CheckpointContext)
  run.ts            (NEW: RunStatus, Run, RunEvent envelope+union)
  escalation.ts     (NEW: Escalation, EscalationOption, EscalationDecision)
backend/src/
  domain/index.ts   (NEW: Agent, GuardrailEngine, Checkpoint, Source, Sink, Meter, AlarmEmitter, Journal, RunEngine)
  agent/agent.ts    (CHANGE: reconciled Agent seam; remove compilePersonaSystem)
  agent/mock-agent.ts, anthropic-agent.ts (CHANGE: AgentResult + system:string)
  guardrails/compile.ts (NEW home of compilePersonaSystem — minimal; Track B enriches)
  stores/{run,run-event,checkpoint,alarm,metric,escalation,webpage}.store.ts (NEW)
  stores/migrate.ts (reuse runner)
  orchestrator/skeleton.ts (NEW: minimal run loop for the skeleton)
  material/sink.ts  (NEW minimal Sink: writes self-contained HTML, serves /published/:id)
  routes/runs.ts    (NEW minimal: POST /runs, GET /runs/:id/events)
  app.ts            (CHANGE: router registry)
backend/migrations/0002_runs.sql (NEW)
frontend/app/skeleton/page.tsx (NEW minimal: render published page + event list)
.github/workflows/ci.yml (CHANGE: skeleton smoke test in the gate)
```

## Phases & Parallelism (within Track 0)
| Phase | Bead | Depends on | Parallel with |
|---|---|---|---|
| 1 — Freeze contracts (+voiceSample) | dp0.1.1 | — | — (gates the rest) |
| 2 — Domain interfaces | dp0.1.2 | dp0.1.1 | dp0.1.3 |
| 2 — Reconcile Agent seam | dp0.1.5 | dp0.1.1 | dp0.1.3 |
| 3 — Migrations 0002 | dp0.1.3 | dp0.1.1 | dp0.1.2, dp0.1.5 |
| 3 — Router registry | dp0.1.6 | — | most things |
| 4 — Stores | dp0.1.4 | dp0.1.3, dp0.1.1 | — |
| 5 — Walking skeleton + CI | dp0.1.7 | dp0.1.5, dp0.1.2, dp0.1.4, dp0.1.6 | — (ties together) |

**Critical path:** `dp0.1.1 → dp0.1.5 → dp0.1.7`. Contracts gate everything; the seam gates the skeleton; the skeleton ties the pipe.

> **Concurrency (Rule 7):** Track 0 edits shared files (`shared/`, `app.ts`, configs). Run it as ONE focused worktree (not parallel sub-agents fighting over `shared/`). Parallelism is BETWEEN tracks (after Track 0), not within it.

## Bead Map
- `publisher-dp0.1` — Track 0 (sub-epic)
  - `publisher-dp0.1.1` — [TDD] Freeze cross-pillar contracts + `voiceSample`
  - `publisher-dp0.1.2` — Domain interfaces module
  - `publisher-dp0.1.3` — [TDD] Migrations 0002 (run_events authoritative)
  - `publisher-dp0.1.4` — [TDD] Stores behind interfaces
  - `publisher-dp0.1.5` — Reconcile Agent seam
  - `publisher-dp0.1.6` — createApp router registry
  - `publisher-dp0.1.7` — [TDD] Walking skeleton + CI smoke gate
