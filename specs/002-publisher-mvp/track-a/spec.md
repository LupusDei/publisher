# Spec — Track A: Persona & Onboarding

> **Root bead:** `publisher-dp0.2` (children `dp0.2.1–dp0.2.4`) · **Master plan:** `../OVERVIEW.md` · **Decisions:** `../ASSUMPTIONS.md`
> **Reuses existing beads.** Unblocked NOW (uses the existing `Persona` contract; absorbs `voiceSample` + design-token vocabulary when Track 0 lands).

## Problem
The persona is the **heart** of Publisher and a graded artifact (R3: "guardrails are declared, not implicit"; R6: "real input from your own work"). Today there's a `PersonaStore` and a `Persona` contract but no way to author, edit, inspect, or seed personas — and no real demo personas exist. A thin persona is also the documented root cause of `VOICE_DRIFT` escalation, so capture quality matters.

## Non-Goals
- The guardrail *compile* (persona → prompt + validators) — that's Track B. Track A captures + stores + displays the declared data; Track B compiles it.
- Run UI / streaming — Track H.

## Locked Decisions (from ASSUMPTIONS.md)
- **D3:** `Persona` gains `voiceSample` (a short writing sample the voice-fidelity checkpoint judges against). Onboarding captures design elements from a **fixed vocabulary** (`palette`, `typography`, `layout`, `tone`) so detective validators (Track B) have known keys.
- **D14:** seed **two voice-distinct real personas** (the demo's "same concept → two pages" proof, ★) — these are R6.
- **D19:** persona **edit** is in scope (HITL "enrich persona" needs it).

## User Stories

### US1 — Author a persona in a guided onboarding (Priority: P1) — bead `dp0.2.2`
**As** a user, **I want** a guided form capturing voice, style points, key learnings, `voiceSample`, and fixed design tokens, **so that** I create a rich, declared guardrail.
**Acceptance:** form posts to `POST /personas`; required fields validated (Zod); intentional loading/success/error states with `aria-live`; design tokens chosen from the fixed vocabulary, not free-text keys.

### US2 — Persona CRUD + edit API (Priority: P1) — bead `dp0.2.1`
**As** the frontend and the orchestrator (enrich-on-escalation), **I want** create / get / list / **update** endpoints, **so that** personas are authored and enriched.
**Acceptance:** layered routes→service→`PersonaStore`; `POST /personas`, `GET /personas`, `GET /personas/:id`, `PATCH /personas/:id`; 2+ tests/endpoint (success + structured error); registers via the Track 0 router registry.

### US3 — Inspect a persona (the declared guardrail) (Priority: P2) — bead `dp0.2.3`
**As** a judge/user, **I want** a gallery + detail view of a persona's declared voice/style/learnings/design, **so that** the guardrail is visibly *declared* (R3). (The *compiled* view — system prompt + validators — is Track B/H.)
**Acceptance:** gallery lists personas; detail renders all declared fields incl. `voiceSample` + design tokens; empty state ("create your first persona").

### US4 — Seed two real demo personas (Priority: P1) — bead `dp0.2.4`
**As** the team, **I want** two voice-distinct real personas seeded, **so that** the demo has genuine input (R6) and the two-persona proof (★).
**Acceptance:** a seed script (or migration/fixture) inserts two complete, voice-distinct personas with real `voiceSample`s; idempotent; documented.

## Success Criteria
- A user authors, edits, and inspects a persona end-to-end; two real personas exist; all endpoints tested; build+test green; CRUD UI has intentional empty/loading/error states.

## Tasks (TDD-shaped — map to beads)
- **T001a/b** [US2] (`dp0.2.1`) Failing tests → impl `backend/src/services/persona.service.ts` (create/get/list/update validating against `PersonaSchema`). RED→GREEN.
- **T002a/b** [US2] (`dp0.2.1`) Failing tests → impl `backend/src/routes/personas.ts` (4 routes, structured errors), register via registry.
- **T003** [US1] (`dp0.2.2`) Build `frontend/app/onboarding/page.tsx`: write failing component tests first (RTL, fetch mocked) → confirm RED → implement guided form (fixed design-token vocabulary) → GREEN.
- **T004** [US3] (`dp0.2.3`) Build `frontend/app/personas/page.tsx` + `[id]/page.tsx`: failing tests first → RED → implement gallery+detail+empty state → GREEN.
- **T005** [US4] (`dp0.2.4`) [docs/scaffold] Seed script `backend/scripts/seed-personas.ts` with two real voice-distinct personas; idempotent; note in README.

> **Concurrency (Rule 7):** Track A runs in its own worktree. It touches `backend/src/{routes/personas,services/persona}*` and `frontend/app/{onboarding,personas}` — disjoint from other tracks. Depends on Track 0's router registry + `voiceSample` for the final form; service/store work can start immediately.
