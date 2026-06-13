# Spec — Track 0: Contracts, Schema & Walking Skeleton (BARRIER)

> **Root bead:** `publisher-dp0.1` (sub-epic of `publisher-dp0` — Publisher MVP)
> **Master plan:** `specs/002-publisher-mvp/OVERVIEW.md` · **Decisions:** `specs/002-publisher-mvp/ASSUMPTIONS.md`
> **Reuses existing beads** `publisher-dp0.1.1 … publisher-dp0.1.7` — this spec details them, it does NOT create a new hierarchy.

## Problem

Eleven tracks want to build in parallel, but they all cross the same seams: the `Agent` worker, the four pillars, the run journal, the event stream. Today those seams are (a) **wrong** — the shipped `Agent` interface takes `Persona` and discards `usage`/`finishReason`, which Observability and 6 alarm types require — and (b) **undefined** — ~10 cross-pillar types (`Phase`, `Usage`, `Metrics`, `CheckpointContext`, `RunEvent`, `Escalation`, `Material`, `Receipt`, …) exist only as names in the plan. Freezing the wrong seams, or letting each track invent its own, guarantees an integration swamp in Track G.

Track 0 freezes the **right** seams once, lands the schema + stores behind them, kills the one shared-file merge conflict (`app.ts`), and proves the whole pipe with a **walking skeleton** that becomes a CI gate. Only then do Tracks A–F fan out.

## Non-Goals (out of scope for Track 0)

- Real pillar logic (guardrail compile rules, judge prompts, meters, real Sink hosting) — those are Tracks B–F.
- The real `AnthropicAgent` research/build behavior beyond making it conform to the reconciled seam — Track C.
- Any UI beyond the **minimal** skeleton page that renders one published page + the raw event stream — Track H owns the real UI.
- Threshold calibration, persona authoring — Tracks A/I.

## Locked Decisions (see ASSUMPTIONS.md for rationale)

| Area | Decision | Bead |
|---|---|---|
| Agent seam | `research/build` take `{ system: string, … }`; return `AgentResult<T>={value,usage,finishReason}`; `compilePersonaSystem` moves to `guardrails/` (D2) | dp0.1.5 |
| Cross-pillar types | All frozen in `shared/src/contracts/` (D8); `Persona.voiceSample` added (D3) | dp0.1.1 |
| Event log | `run_events` authoritative; `RunEvent` carries `{runId,seq,ts,pillar?}` + a `draft` event (D4,D5) | dp0.1.1, dp0.1.3 |
| Alarm surfacing | Pillars **return** alarms (never throw); `Source.load → {material?,alarms[]}` (D7) | dp0.1.1 |
| Routing | `createApp` becomes a router registry (D18) | dp0.1.6 |
| Skeleton | Mock pipe E2E, wired as a CI smoke gate (D1) | dp0.1.7 |

## User Stories

### US1 — Every track builds against ONE correct, frozen contract (Priority: P0)
**As** a pillar-track engineer, **I want** the Agent seam reconciled and all cross-pillar types frozen in `shared/`, **so that** my track and Track G integrate without type mismatches or rework.
**Acceptance:**
- The `Agent` interface is `research(input:{system:string;concept:string}):Promise<AgentResult<ResearchResult>>` and `build(input:{system:string;research:ResearchResult;feedback?:string}):Promise<AgentResult<Webpage>>`.
- `compilePersonaSystem` no longer lives in `backend/src/agent/`; the agent imports no `Persona`.
- `MockAgent` and `AnthropicAgent` both populate `usage` + `finishReason`; `MockAgent`'s usage is synthetic but real-shaped.
- `shared/` exports `run.ts`, `checkpoint.ts`, `metrics.ts`, `escalation.ts`, `material.ts`, `validator.ts`; `Persona` has `voiceSample`.
- Contract unit tests (valid/invalid/edge) pass; full repo `npm run build` + `npm test` green.

### US2 — Harness state persists behind store interfaces, with an authoritative event log (Priority: P0)
**As** the orchestrator (Track G) and the UI (Track H), **I want** `run_events` as the source-of-truth journal plus queryable projections, **so that** replay and WS-reconnect are one mechanism.
**Acceptance:**
- Migrations `0002+` create `runs`, `run_events` (with monotonic `seq` per run), `checkpoints`, `alarms`, `metrics`, `escalations`, `webpages`; idempotent.
- Stores (`RunStore`, `RunEventStore`, …) behind interfaces; better-sqlite3 impl; in-memory SQLite in tests.
- `RunEventStore.append` enforces monotonic `seq`; `loadSince(runId, seq)` returns ordered events (the WS-reconnect/replay primitive).

### US3 — The whole pipe runs end-to-end on mocks and stays green in CI (Priority: P0)
**As** the team, **I want** a walking skeleton wired as a CI smoke gate, **so that** pillars thicken a proven pipe instead of assembling into an unproven one.
**Acceptance:**
- A minimal orchestrator runs `MockAgent.research → build → one trivial always-pass checkpoint → Sink writes a static page → /published/:id serves it`, emitting `RunEvent`s to the journal.
- `POST /runs` starts it; the skeleton UI page renders the published HTML + the event list.
- An integration test drives the full pipe (supertest) and asserts a `published` event + a fetchable page; this test runs in CI as a blocking smoke gate.
- `createApp` accepts a router registry; `personas` and `runs` routers register without editing shared lines.

## Success Criteria
- `npm run build && npm test` green across all workspaces.
- `bd ready` after Track 0 exposes Tracks A–F fan-out (their epics unblock).
- A new engineer runs the skeleton and sees a mock page published + streamed within minutes.
- No `any` without justification; coverage gate (80/70/60) holds; env-gated real paths excluded per D20.
