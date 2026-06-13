# Plan — Real Run Tooling

> **Branch:** `007-real-run-tooling` · **Epic:** `publisher-rrt` · **Priority:** P1 · **Date:** 2026-06-13
> Phases map to `publisher-rrt.x` sub-epics. Backend-only (the `Agent` seam + composition root + checkpoints).

## Summary
Make `USE_REAL_AGENT` runs actually work: upgrade the AI SDK so Opus-4.8 runs and the server-side web tools exist; select the agent per run from the worker the user picked; give the research agent real `web_search`/`web_fetch` so research yields citable sources; and judge voice-fidelity with real Claude in real mode. Then verify a real run publishes end-to-end.

## Technical Context
- **Stack:** Node + TypeScript (strict), Vitest. The agent seam is `backend/src/agent/*`; composition root is `backend/src/server.ts` + `composeRunDeps`; the run loop is `backend/src/orchestrator/run-engine.ts`; checkpoints under `backend/src/checkpoints/*`.
- **External:** Anthropic API via `ai` + `@ai-sdk/anthropic`. Live calls are **env-gated** (`USE_REAL_AGENT`) and never run in CI — agents are covered by **mocked-SDK contract tests**.
- **Constraints:** layered architecture (routes→services→stores); fail-closed checkpoints; TDD; zero new hard-coded model defaults outside `workers.ts`.

## Architecture Decision
- **Per-run agent factory.** Replace the single startup `agent` with an **agent factory** `(workerId) → Agent` injected into the run deps; `run-engine.start()` builds the agent for the run's `workerId`. This makes R11 real and lets each run pick its model. Removes the `server.ts` sonnet stopgap.
- **SDK upgrade is foundational.** Opus-4.8 support and the web tools both come from `@ai-sdk/anthropic@3.x` / `ai@6`; everything else depends on it. Breaking changes localized to the two real agents (`maxSteps` → `stopWhen: stepCountIs(n)`; `generateText`/`generateObject`/`createAnthropic` signatures).
- **Real judge via deps.** `voice-fidelity.ts` is already judge-injectable; add an LLM judge impl and wire it in the composition root **only when `USE_REAL_AGENT`**. Deterministic judge stays the default → tests/mock unaffected, fail-closed intact.

## Files Changed
| File | Change |
|---|---|
| `backend/package.json` | bump `@ai-sdk/anthropic` 1.2.12→^3, `ai` ^4→^6 |
| `backend/src/agent/anthropic-agent.ts` | migrate to new SDK API (`stopWhen`/`stepCountIs`, signatures) |
| `backend/src/agent/anthropic-research-agent.ts` | migrate + add server-side `web_search`/`web_fetch`; populate `sources[]` |
| `backend/src/agent/index.ts` | export an agent **factory** `(workerId)→Agent` |
| `backend/src/services/run.service.ts` / run-deps composition | accept + use the factory per run |
| `backend/src/orchestrator/run-engine.ts` | build the agent for `ctx.workerId` per run |
| `backend/src/server.ts` | compose with the factory; **remove the sonnet stopgap**; wire the real judge when `USE_REAL_AGENT` |
| `backend/src/checkpoints/judge.ts` | add the real LLM (Claude) voice judge |
| `backend/scripts/verify-real-agent.ts` | **new** — env-gated manual check (opus-4-8 + sonnet-4-6) |
| `HARNESS.md` / `README` / `backend/.env.example` | real-mode setup docs |

## Phase 1 — Foundational: AI SDK upgrade (`rrt.1`) — absorbs `publisher-aisdk`
Bump deps; migrate the two real agents to the new API; add an env-gated verification script. Mocked-SDK contract tests assert the new call shape (no `temperature`, `stopWhen` used, results mapped). Unblocks all later phases.

## Phase 2 — US1: Per-run worker selection (`rrt.2`) — absorbs `publisher-workerwire`
Introduce the agent factory; thread `workerId` from the run into agent creation in run-deps/run-engine; remove the `server.ts` stopgap. Tests prove each `workerId` → correct model/agent; unknown → default.

## Phase 3 — US2: Real web research tools (`rrt.3`)
Add `web_search`/`web_fetch` to `AnthropicResearchAgent`; extract real source URLs into `sources[]`. Mocked-SDK tests assert tools are passed and sources are populated from tool results.

## Phase 4 — US3: Real voice judge in real mode (`rrt.4`)
Implement an LLM voice judge (Claude) returning a 0–1 score; inject it via deps only when `USE_REAL_AGENT`. Tests: judge selection by mode; score mapping (mocked SDK); fault → fail-closed.

## Phase 5 — Polish & Verify (`rrt.5`)
Docs for real-mode setup (HARNESS.md/README/.env.example) + an env-gated end-to-end verification that a real `anthropic-research` run researches-with-sources → builds → publishes (or escalates legitimately).

## Parallel Execution
- **After `rrt.1`**, phases 2/3/4 are largely parallel: `rrt.2` (run-deps/run-engine/server), `rrt.3` (research-agent), `rrt.4` (judge). **Conflict note:** `rrt.2` and `rrt.4` both edit the composition root `server.ts` — sequence them or one owner does both composition edits.
- `rrt.5` depends on 2+3+4.

## Verification Steps
- [ ] `npm run build` + `npm test` + coverage green; CI makes no live API calls.
- [ ] Env-gated script: `claude-opus-4-8` and `claude-sonnet-4-6` both succeed via the SDK (no temperature error).
- [ ] Pick each worker → the run uses that model (no stopgap).
- [ ] Real `anthropic-research` run returns real `sources[]`; research-sufficiency can pass; a page publishes.

## Bead Map
- `publisher-rrt` — Real Run Tooling
  - `rrt.1` Foundational — AI SDK upgrade · `rrt.2` US1 per-run worker selection · `rrt.3` US2 real web tools · `rrt.4` US3 real voice judge · `rrt.5` Polish/verify
> ✅ Created in beads with these exact IDs (`publisher-rrt` + `.1`–`.5` + tasks), captured in `.beads/issues.jsonl`. Supersedes `publisher-aisdk` (→ `rrt.1`) and `publisher-workerwire` (→ `rrt.2`), both closed. See beads-import.md for the full dependency list.
