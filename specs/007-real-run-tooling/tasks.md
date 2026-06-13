# Tasks — Real Run Tooling

**Input:** `/specs/007-real-run-tooling/` · **Epic:** `publisher-rrt`

> TDD-shaped (Rule 1). `[P]` = parallelizable (different files). `[US]` = user story.
> Real agents are env-gated (never hit the live API in CI); test them by **mocking the `ai` SDK** and asserting call shape + result mapping.

## Phase 1 — Foundational: AI SDK upgrade (`rrt.1`)

- [ ] **T001** [setup] Bump `backend/package.json`: `@ai-sdk/anthropic` 1.2.12 → `^3`, `ai` `^4` → `^6`; install and resolve peer ranges. No behavior.
- [ ] **T002a** [P] Write failing tests in `backend/tests/unit/anthropic-agent.test.ts` (mock `ai`'s `generateText`/`generateObject`): `research()`/`build()` call with `system`+`prompt`/`schema`, use `stopWhen: stepCountIs(8)` (not `maxSteps`), send **no** `temperature`, and map `{text|object, usage, finishReason}` to `AgentResult`. Confirm RED.
- [ ] **T002b** Migrate `backend/src/agent/anthropic-agent.ts` to the new SDK API until T002a is GREEN.
- [ ] **T003a** [P] Write failing tests in `backend/tests/unit/anthropic-research-agent.test.ts` (mock SDK) for the migrated `research()`/`build()` call shape + result mapping (web tools added in Phase 3). Confirm RED.
- [ ] **T003b** Migrate `backend/src/agent/anthropic-research-agent.ts` to the new SDK API until T003a is GREEN.
- [ ] **T004** [docs] Add `backend/scripts/verify-real-agent.ts` — an env-gated manual check that `claude-opus-4-8` and `claude-sonnet-4-6` each succeed via the upgraded SDK (skips without a key). Document running it.

**Checkpoint:** SDK upgraded; both models drive the SDK without the temperature error.

---

## Phase 2 — US1: Per-run worker selection (Priority: P1, MVP) (`rrt.2`)

**Goal:** the picked worker actually selects the model; stopgap removed.

- [ ] **T005a** [US1] Write failing tests in `backend/tests/unit/agent-factory.test.ts`: an agent factory `createAgentForWorker({USE_REAL_AGENT, ANTHROPIC_API_KEY, workerId})` returns an agent whose model is `claude-opus-4-8` for `opus`, `claude-sonnet-4-6` for `sonnet`, the research agent for `anthropic-research`, default for unknown, and `MockAgent` when real mode is off. Confirm RED.
- [ ] **T005b** [US1] Implement the factory in `backend/src/agent/index.ts` and thread `workerId` per run through the run-deps composition + `backend/src/orchestrator/run-engine.ts` (build the agent for `ctx.workerId` in `start()`); update `backend/src/services/run.service.ts` as needed. GREEN.
- [ ] **T006** [US1] Remove the sonnet **stopgap** in `backend/src/server.ts` (compose with the factory instead of a single startup agent). Phases: write/adjust a failing test asserting a real run uses the run's `workerId` model (not a hardcoded one) → confirm RED → remove stopgap + wire factory → confirm GREEN.

**Checkpoint:** worker dropdown is functional; no stopgap; Opus-4.8 selectable.

---

## Phase 3 — US2: Real web research tools (Priority: P1) (`rrt.3`)

**Goal:** research gathers real sources.

- [ ] **T007a** [US2] Write failing tests in `backend/tests/unit/anthropic-research-agent.test.ts` (mock SDK tools): `research()` passes Anthropic server-side `web_search`/`web_fetch` tools and populates `sources[]` (real URLs) from the tool results. Confirm RED.
- [ ] **T007b** [US2] Implement web tools in `backend/src/agent/anthropic-research-agent.ts` (provider `web_search`/`web_fetch`; extract source URLs into `sources[]`) until T007a is GREEN.

**Checkpoint:** anthropic-research worker returns real sources; research-sufficiency can pass.

---

## Phase 4 — US3: Real voice judge in real mode (Priority: P2) (`rrt.4`)

**Goal:** real Claude judges voice-fidelity in real mode.

- [ ] **T008a** [US3] Write failing tests in `backend/tests/unit/voice-judge.test.ts` (mock SDK): a real LLM voice judge maps a Claude response to a 0–1 score; selection picks the real judge when `USE_REAL_AGENT` and the deterministic judge otherwise; a judge fault propagates so voice-fidelity fails-closed (critical `CHECKPOINT_ERROR`). Confirm RED.
- [ ] **T008b** [US3] Implement the LLM judge in `backend/src/checkpoints/judge.ts` and wire it into the voice-fidelity checkpoint via the composition root (`backend/src/server.ts`/run-deps) only when `USE_REAL_AGENT`. GREEN.

**Checkpoint:** real runs judged by real Claude; mock/test mode unchanged; fail-closed intact.

---

## Phase 5 — Polish & Verify (`rrt.5`)

- [ ] **T009** [docs] Document real-mode setup (`USE_REAL_AGENT` + `ANTHROPIC_API_KEY` + worker selection + web tools) in `HARNESS.md`, `README.md`, and `backend/.env.example`.
- [ ] **T010** [docs] End-to-end verification: extend `backend/scripts/verify-real-agent.ts` (or add a checklist) proving a real `anthropic-research` run researches-with-sources → builds → publishes a page (or escalates legitimately). Env-gated; manual.

**Checkpoint:** real runs publish end-to-end; setup documented.

---

## Dependencies
- Phase 1 (`rrt.1`) → blocks Phases 2, 3, 4.
- Phases 2, 3, 4 run in parallel after Phase 1. **Conflict:** `rrt.2` (T006) and `rrt.4` (T008b) both edit `server.ts` — sequence them (or one owner does both composition edits).
- Phase 5 depends on 2 + 3 + 4.
- Within tasks: every `Tb` depends on its `Ta`; T002/T003/T004 depend on T001; T006 depends on T005; T007 depends on T003 (migrated research agent).

## Parallel Opportunities
- `[P]`: T002 (anthropic-agent) ∥ T003 (research-agent) within Phase 1.
- After `rrt.1`: `rrt.3` (research-agent) ∥ `rrt.4` (judge); `rrt.2` overlaps `server.ts` with `rrt.4` (coordinate).
