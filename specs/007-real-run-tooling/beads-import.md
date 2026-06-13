# Real Run Tooling — Beads

**Feature:** 007-real-run-tooling · **Generated:** 2026-06-13 · **Source:** specs/007-real-run-tooling/tasks.md
**Owner:** Tassadar · **Epic:** `publisher-rrt`

> Supersedes the standalone beads `publisher-aisdk` (→ `rrt.1`) and `publisher-workerwire` (→ `rrt.2`) — both closed with a pointer to this epic. Backend-only.

## Root Epic
- **Title:** Real Run Tooling · **Type:** epic · **Priority:** P1
- **Description:** Make `USE_REAL_AGENT` runs research-with-sources, build, and publish — SDK upgrade, per-run worker selection, real web tools, real voice judge.

## Sub-Epics (phases)
| Phase | Title | Type | Pri | Depends | Bead |
|---|---|---|---|---|---|
| 1 | Foundational — AI SDK upgrade | epic | P1 | — | `rrt.1` |
| 2 | US1 — per-run worker selection (MVP) | epic | P1 | `rrt.1` | `rrt.2` |
| 3 | US2 — real web research tools | epic | P1 | `rrt.1` | `rrt.3` |
| 4 | US3 — real voice judge (real mode) | epic | P2 | `rrt.1` | `rrt.4` |
| 5 | Polish — docs + e2e real-run verify | epic | P2 | `rrt.2`,`rrt.3`,`rrt.4` | `rrt.5` |

## Tasks
| T-ID | Title | Path | Bead | Depends |
|---|---|---|---|---|
| T001 | [setup] bump @ai-sdk/anthropic→3, ai→6 | `backend/package.json` | `rrt.1.1` | — |
| T002 | [TDD] migrate anthropic-agent to new SDK API | `backend/src/agent/anthropic-agent.ts` | `rrt.1.2` | `rrt.1.1` |
| T003 | [TDD] migrate anthropic-research-agent to new SDK API | `backend/src/agent/anthropic-research-agent.ts` | `rrt.1.3` | `rrt.1.1` |
| T004 | [docs] env-gated verify script (opus-4-8 + sonnet-4-6) | `backend/scripts/verify-real-agent.ts` | `rrt.1.4` | `rrt.1.2`,`rrt.1.3` |
| T005 | [TDD] agent factory + thread workerId per run | `backend/src/agent/index.ts`, run-deps, `orchestrator/run-engine.ts` | `rrt.2.1` | `rrt.1.2` |
| T006 | [TDD] remove server.ts sonnet stopgap; compose with factory | `backend/src/server.ts` | `rrt.2.2` | `rrt.2.1` |
| T007 | [TDD] real web_search/web_fetch → sources[] | `backend/src/agent/anthropic-research-agent.ts` | `rrt.3.1` | `rrt.1.3` |
| T008 | [TDD] real LLM voice judge + mode-gated injection | `backend/src/checkpoints/judge.ts`, `server.ts` | `rrt.4.1` | `rrt.1.2` |
| T009 | [docs] real-mode setup docs | `HARNESS.md`, `README.md`, `backend/.env.example` | `rrt.5.1` | `rrt.2.2`,`rrt.3.1`,`rrt.4.1` |
| T010 | [docs] e2e real-run verification | `backend/scripts/verify-real-agent.ts` | `rrt.5.2` | `rrt.2.2`,`rrt.3.1`,`rrt.4.1` |

## Summary
| Phase | Tasks | Priority |
|---|---|---|
| 1: Foundational (SDK upgrade) | 4 | P1 |
| 2: US1 worker selection (MVP) | 2 | P1 |
| 3: US2 web tools | 1 | P1 |
| 4: US3 real judge | 1 | P2 |
| 5: Polish/verify | 2 | P2 |
| **Total** | **10 tasks · 5 sub-epics · 1 root = 16 beads** | |

## Dependency Graph
```
rrt.1 Foundational (SDK upgrade) ──┬─► rrt.2 worker selection ─┐
                                   ├─► rrt.3 web tools ────────┼─► rrt.5 docs + e2e verify
                                   └─► rrt.4 real judge ───────┘
```
**Conflict:** `rrt.2.2` and `rrt.4.1` both edit `server.ts` — sequence or single-owner.

## Bead Map (actual IDs)
- `publisher-rrt` — Real Run Tooling · P1 · epic
  - `publisher-rrt.1` Foundational — AI SDK upgrade → `.1.1` bump deps · `.1.2` migrate anthropic-agent · `.1.3` migrate research-agent · `.1.4` verify script
  - `publisher-rrt.2` US1 worker selection (MVP) → `.2.1` agent factory + wiring · `.2.2` remove stopgap
  - `publisher-rrt.3` US2 web tools → `.3.1` web_search/web_fetch → sources[]
  - `publisher-rrt.4` US3 real voice judge → `.4.1` LLM judge + mode-gated injection
  - `publisher-rrt.5` Polish → `.5.1` docs · `.5.2` e2e verify

**Status:** all 16 beads created and captured in `.beads/issues.jsonl`. `publisher-aisdk` + `publisher-workerwire` closed as superseded. Dependency edges (see Dependency Graph + tasks.md) were asserted via `bd dep add` but may need re-asserting once the publisher dolt server is stable (its live read path is currently flapping — raynor). The artifacts here are the authoritative ordering.
