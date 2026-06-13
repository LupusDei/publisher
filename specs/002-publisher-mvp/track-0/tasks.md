# Tasks — Track 0: Contracts, Schema & Walking Skeleton

> TDD-shaped (Rule 1 / `.claude/rules/03-testing.md`). `[P]` = parallelizable (different files, no dep). Each `T###` maps to an existing bead (see beads-import.md). Within Track 0, prefer ONE worktree — these edit shared files.

## Phase 1 — Freeze contracts  (bead `publisher-dp0.1.1`)

- [ ] **T001a** [US1] Write failing tests in `shared/tests/unit/metrics.test.ts` for `metrics.ts` — `Usage`, `FinishReason`, `Phase`, `Metrics`, `MetricBreach`, `Budget`, `AgentResult<T>` (valid / invalid / edge). Confirm RED.
- [ ] **T001b** [US1] Implement `shared/src/contracts/metrics.ts` (Zod + inferred types). Run until GREEN.
- [ ] **T002a** [P] [US1] Write failing tests in `shared/tests/unit/material.test.ts` for `Material`, `Receipt`. Confirm RED.
- [ ] **T002b** [US1] Implement `shared/src/contracts/material.ts`. GREEN.
- [ ] **T003a** [P] [US1] Write failing tests in `shared/tests/unit/validator.test.ts` for `Validator`, `ValidatorFinding`. RED.
- [ ] **T003b** [US1] Implement `shared/src/contracts/validator.ts`. GREEN.
- [ ] **T004a** [US1] Write failing tests in `shared/tests/unit/checkpoint.test.ts` for `CheckpointName`, `CheckpointResult` (incl. `alarms[]`), `CheckpointContext` (`persona,material,research,webpage,attempt,priorResults`). RED.
- [ ] **T004b** [US1] Implement `shared/src/contracts/checkpoint.ts`. GREEN.
- [ ] **T005a** [US1] Write failing tests in `shared/tests/unit/run.test.ts` for `RunStatus`, `Run`, and the `RunEvent` discriminated union WITH envelope `{runId,seq,ts,pillar?}` incl. the `draft` variant. RED.
- [ ] **T005b** [US1] Implement `shared/src/contracts/run.ts`. GREEN.
- [ ] **T006a** [P] [US1] Write failing tests in `shared/tests/unit/escalation.test.ts` for `Escalation`, `EscalationOption`, `EscalationDecision`. RED.
- [ ] **T006b** [US1] Implement `shared/src/contracts/escalation.ts`. GREEN.
- [ ] **T007a** [US1] Write failing tests in `shared/tests/unit/persona.test.ts` covering new `voiceSample` field (required-string, valid/invalid/edge). RED.
- [ ] **T007b** [US1] Add `voiceSample` to `shared/src/contracts/persona.ts` + export all new modules from `shared/src/index.ts`. GREEN. Run full `shared` suite.

## Phase 2 — Domain interfaces & Agent seam  (beads `publisher-dp0.1.2`, `publisher-dp0.1.5`)

- [ ] **T008** [scaffold] [US1] Create `backend/src/domain/index.ts` with TS interfaces only (no impl): `Agent`, `GuardrailEngine`, `Checkpoint`, `Source`, `Sink`, `Meter`, `AlarmEmitter`, `Journal`, `RunEngine`, importing types from `@publisher/shared`. (bead dp0.1.2)
- [ ] **T009a** [US1] Write failing tests in `backend/tests/unit/agent-seam.test.ts`: `MockAgent.research/build` accept `{system:string,…}` and return `AgentResult<T>` with populated `usage` + `finishReason`. RED. (bead dp0.1.5)
- [ ] **T009b** [US1] Reconcile `backend/src/agent/agent.ts` (interface), `mock-agent.ts`, `anthropic-agent.ts` to the new seam; **move** `compilePersonaSystem` → `backend/src/guardrails/compile.ts`; update `agent/index.ts` exports. GREEN. Confirm the agent no longer imports `Persona`. (bead dp0.1.5)

## Phase 3 — Migrations & Router registry  (beads `publisher-dp0.1.3`, `publisher-dp0.1.6`)

- [ ] **T010a** [US2] Write failing tests in `backend/tests/unit/migrate-0002.test.ts`: applying migrations on a fresh in-memory DB creates `runs, run_events, checkpoints, alarms, metrics, escalations, webpages`; re-applying is idempotent; `run_events` has a per-run monotonic `seq`. RED.
- [ ] **T010b** [US2] Author `backend/migrations/0002_runs.sql`. GREEN.
- [ ] **T011a** [P] [US3] Write failing tests in `backend/tests/unit/app-registry.test.ts`: `createApp({ routers:[{path,router}] })` mounts each router; health still works. RED. (bead dp0.1.6)
- [ ] **T011b** [US3] Refactor `backend/src/app.ts` to the router-registry shape; keep health via the registry. GREEN. (bead dp0.1.6)

## Phase 4 — Stores  (bead `publisher-dp0.1.4`)

- [ ] **T012a** [US2] Write failing tests in `backend/tests/unit/run-event-store.test.ts`: `append` enforces monotonic `seq`; `loadSince(runId, seq)` returns ordered events; `load(runId)` returns all. RED.
- [ ] **T012b** [US2] Implement `backend/src/stores/run-event.store.ts` (interface + better-sqlite3). GREEN.
- [ ] **T013a** [P] [US2] Write failing tests in `backend/tests/unit/run-store.test.ts` for `RunStore` (create/get/list/updateStatus). RED.
- [ ] **T013b** [US2] Implement `backend/src/stores/run.store.ts`. GREEN.
- [ ] **T014a** [P] [US2] Write failing tests for the projection stores in `backend/tests/unit/projection-stores.test.ts` — `CheckpointStore`, `AlarmStore`, `MetricStore`, `EscalationStore`, `WebpageStore` (insert + query-by-run). RED.
- [ ] **T014b** [US2] Implement those five stores behind interfaces. GREEN.

## Phase 5 — Walking skeleton + CI gate  (bead `publisher-dp0.1.7`)

- [ ] **T015a** [US3] Write failing tests in `backend/tests/unit/skeleton-orchestrator.test.ts`: a minimal run loop calls `MockAgent.research → build → trivial always-pass checkpoint → Sink.publish`, appending `phase/draft/checkpoint/published` `RunEvent`s (with monotonic `seq`) to the journal. RED.
- [ ] **T015b** [US3] Implement `backend/src/orchestrator/skeleton.ts` + a minimal `backend/src/material/sink.ts` (writes a self-contained HTML file, returns `Receipt`). GREEN.
- [ ] **T016a** [US3] Write failing integration tests in `backend/tests/integration/runs.test.ts` (supertest): `POST /runs` runs the skeleton to a `published` event; `GET /published/:id` returns the HTML; `GET /runs/:id/events` returns the ordered journal. RED.
- [ ] **T016b** [US3] Implement `backend/src/routes/runs.ts` + `/published/:id` static serving; register both via the router registry. GREEN.
- [ ] **T017** [P] [US3] [scaffold] Add minimal `frontend/app/skeleton/page.tsx` that POSTs a run and renders the published HTML + the event list (loading/error states). Smoke-rendered only.
- [ ] **T018** [US3] [docs] Wire the skeleton integration test into `.github/workflows/ci.yml` as a blocking smoke gate; document the D20 coverage-exclusion for env-gated/real-IO paths. Run `npm run build && npm test` green across workspaces.

## Exit criteria
- Full `npm run build && npm test` green. `bd ready` unblocks Tracks A–F. Skeleton publishes + streams a mock page. CI smoke gate live.
