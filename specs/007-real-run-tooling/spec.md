# Spec — Real Run Tooling (Epic `publisher-rrt`)

> **Owner:** Tassadar · **Created:** 2026-06-13 · **Design contract:** `../design/atelier.md`
> Folds in (supersedes) the standalone beads `publisher-aisdk` and `publisher-workerwire`.

## Problem
With `USE_REAL_AGENT=true` + a key, **no real run can complete** — every one fails or escalates. Four confirmed causes (live-diagnosed 2026-06-13):

1. **The pinned SDK can't drive Opus-4.8.** `@ai-sdk/anthropic@1.2.12` + `ai@4` inject a `temperature` that `claude-opus-4-8` rejects (`"temperature is deprecated for this model"`). Raw API + key work; `sonnet-4-6`/`opus-4-6` work via the SDK; only `opus-4-8` fails.
2. **No real research sources.** That old SDK has no server-side web tools, so research returns `sources: []` → the **research-sufficiency** checkpoint fails → every real run escalates instead of publishing.
3. **Worker selection is cosmetic.** `server.ts` builds **one** agent at startup (`createAgent({USE_REAL_AGENT, ANTHROPIC_API_KEY})`, no `workerId` → defaults to `opus` = `claude-opus-4-8`) and injects it for all runs. The per-run `workerId` only labels telemetry/alarms (`ctx.workerId`); it never selects the model. So the R11 "worker swap" doesn't work.
4. **The voice judge isn't real in real mode.** `checkpoints/voice-fidelity.ts` defaults to `deterministicVoiceJudge` even when `USE_REAL_AGENT` — real runs aren't judged by real Claude.

A **stopgap** currently pins the startup agent to `workerId: "sonnet"` in `backend/src/server.ts` (sonnet-4-6 works on the old SDK) so real runs at least execute. It must be removed once worker-wiring lands.

## Non-Goals
- No new run UI (the existing `/runs` + run view stay). Worker dropdown already exists.
- No multi-provider beyond Anthropic in this epic (the `Agent` seam stays provider-swappable for later).
- Not fixing the unrelated pre-existing test-env bug (`publisher-env-jsdom`) or the bare-array `fetchRuns` bug (`publisher-runsenv`).

## Locked decisions
- **Upgrade the AI SDK** (`@ai-sdk/anthropic` 1.2.12→3.x, `ai` 4→6) rather than pin to an older model — it's the only way to run Opus-4.8 *and* it unlocks the server-side web tools.
- **Agent is selected per run** from the run's `workerId` (a factory), not built once at startup — this makes R11 real and removes the stopgap.
- **Real LLM voice judge injected only when `USE_REAL_AGENT`**; the deterministic offline judge stays the default for tests/mock. Fail-closed preserved.

## User Stories

### US1 — Pick a worker, get that model (Priority: P1, MVP) — beads `rrt.2`
**As** a user, **I want** the worker I pick to actually run that model, **so that** the R11 swap is real and Opus-4.8 vs Sonnet-4.6 vs real-research are genuinely different runs.
**Acceptance:** the agent is created per run from `workerId` (`opus`→`claude-opus-4-8`, `sonnet`→`claude-sonnet-4-6`, `anthropic-research`→research agent; unknown→default). The `server.ts` sonnet stopgap is removed. A test proves each `workerId` yields the right model behind the `Agent` seam.

### US2 — Research gathers real sources (Priority: P1) — beads `rrt.3`
**As** a user, **I want** the research phase to use real web search, **so that** runs gather citable sources and pass research-sufficiency instead of always escalating.
**Acceptance:** `AnthropicResearchAgent` uses Anthropic server-side `web_search`/`web_fetch` (post-upgrade) and returns a populated `sources[]` (real URLs) from the tool results. On the `anthropic-research` worker, research-sufficiency can pass.

### US3 — Real voice judgment in real mode (Priority: P2) — beads `rrt.4`
**As** the harness, **I want** voice-fidelity judged by real Claude in real mode, **so that** the gate reflects genuine on-voice assessment, not a heuristic.
**Acceptance:** when `USE_REAL_AGENT`, an LLM voice judge (Claude) is injected into the voice-fidelity checkpoint; mock/test mode keeps the deterministic judge; a judge fault still fails-closed (critical `CHECKPOINT_ERROR`).

## Edge Cases
- Unknown/missing `workerId` → default worker (no crash).
- Real API error (rate-limit / refusal / outage) → existing `PROVIDER_ERROR`/alarm path; run fails gracefully (not a hang).
- Web search returns nothing → `sources: []` → research-sufficiency legitimately escalates (correct behavior, not a crash).
- Real judge LLM errors/times out → fail-closed (treat as fail + escalate), never fail-open.

## Success Criteria
- A real run on the **anthropic-research** worker: researches **with real sources** → builds → passes/escalates legitimately → **publishes a page**. (SC-001)
- The worker dropdown selects the model; the stopgap is gone. (SC-002)
- `claude-opus-4-8` runs without the temperature error. (SC-003)
- Full suite + coverage green; the env-gated real agents are covered by mocked-SDK contract tests; CI never calls the live API. (SC-004)

## Design addendum (General, 2026-06-13) → `rrt.6`
**Research is always done by the web-research agent** (`web_search`/`web_fetch`, real sources); **the model the user selects is the one that BUILDS the final page** (build + refine phases), not the one doing the research. Today a single worker does both — `rrt.2` wires per-run model selection; `rrt.6` then splits it: run-engine uses the research agent for `research()` and the selected model for `build()`/refine, and the UI relabels the picker as the **"Builder model"** (research runs automatically). Option A (dedicated research agent) is accepted for now; `rrt.6` is the near-term refinement to bake into the UI.
