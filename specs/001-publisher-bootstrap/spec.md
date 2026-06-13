# Spec — Publisher Bootstrap (Scaffold & Project Init)

> **Root epic:** `publisher-3lc`
> **Scope:** Foundation only. Stand up the project skeleton so build-day execution of the four harness pillars moves fast. **No pillar implementations here.**
> **Sources:** `docs/architecture-defense.md`, `docs/agent-integration.md`, `docs/publisher-design.html` (§10 Build Order), `constitution.md`, `.claude/rules/03-testing.md`.

## Problem

Publisher is a **harness** (the graded artifact) that turns a research concept into a persona-voiced single-page webpage, wrapping a swappable research→build→refine agent in four separable pillars. Build day is tomorrow. Without a clean, conventions-compliant skeleton — workspaces, strict TS, layered backend, Next.js frontend, SQLite, the Agent seam, shared contracts, and a blocking CI gate — the team will burn build-day hours on setup instead of pillars.

This epic delivers exactly that foundation and nothing more. Every later pillar epic (Persona/Guardrails, Checkpoints, Observability/Alarms, Orchestrator, UI) plugs into the seams created here.

## Non-Goals (explicitly out of scope)

- The four pillars (Material, Guardrails/Persona compile, Checkpoints, Observability & Alarms).
- The Orchestrator run loop, checkpoint journal, replay.
- Real research/build/refine calls to Anthropic (the real agent is a **skeleton, env-gated, defaults off**).
- Onboarding UX beyond a placeholder; run-stream UI; escalation UI.
- Full DB schema — only the `personas` table is migrated this epic; other tables are deferred to build-day pillar epics.

## Locked Decisions (no clarification round — Constitution Rule 5 forbids interactive blocking)

| Area | Decision | Rationale |
|---|---|---|
| Repo layout | **npm workspaces** monorepo: `backend/`, `frontend/`, `shared/` | Matches the `backend/tests/**`, `frontend/tests/**` conventions in `.claude/rules/03-testing.md`; simplest multi-package setup; one `npm install`. |
| Backend framework | **Express** + `ws` (later) | Lowest-friction, most universally known by agents → minimal build-day friction. Layered (routes→services→stores) per Constitution Rule 4. |
| Validation | **Zod** at every boundary | Constitution Rule 2 (runtime validation at API boundaries); doubles as the shared-contract source of truth. |
| SQLite driver | **better-sqlite3**, behind a store interface | Synchronous, zero-config, fast for the demo. Interface keeps the documented **Turso/libSQL** cloud path a later swap. |
| Frontend | **Next.js (App Router)** + React + TS strict | Deploys to Vercel (control plane); matches the design doc. |
| Test framework | **Vitest** (+ `@testing-library/react`, `supertest`) | Constitution Rule 1; coverage 80/70/60. |
| Agent default | **MockAgent** (deterministic, token-free); real `AnthropicAgent` is env-gated (`USE_REAL_AGENT=true`) | Develop/CI the harness without burning tokens or needing a key. |

> If any locked decision turns out to block the team, raise it via `file_question` (non-blocking) — do not stall.

## User Stories

### US1 — Developer can install and run the whole project (Priority: P1)
**As** a build-day engineer, **I want** `npm install` then `npm run dev` to boot backend + frontend, **so that** I can start implementing pillars immediately.
**Acceptance:**
- `npm install` at root links all three workspaces.
- `npm run dev` boots the Express backend and the Next.js frontend together.
- `npm run build`, `npm test`, `npm run lint`, `npm run test:coverage` all run from root and fan out to workspaces.

### US2 — The FE↔BE seam is proven end-to-end (Priority: P1)
**As** an engineer, **I want** the frontend shell page to fetch the backend `/health` endpoint, **so that** the full request path (browser → API → response) is verified before any feature work.
**Acceptance:**
- `GET /health` returns `{status:"ok", version, uptime}` with CORS for the FE origin.
- The shell page renders **loading / success / error** states (UX: all states intentional, status announced via `aria-live`).
- Integration test (supertest) + component test (RTL, fetch mocked) both pass.

### US3 — Strict types and shared contracts are in place (Priority: P1)
**As** an engineer, **I want** TS strict mode everywhere and a shared contracts module, **so that** FE and BE agree on `Webpage`, `Persona`, and `Alarm` shapes from day one.
**Acceptance:**
- `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`) extended by every workspace.
- `shared/` exports Zod schemas + inferred types for `Webpage {title,html,css,summary,sourcesUsed}`, `Persona`, `Alarm`.
- Contract unit tests (valid/invalid/edge) pass.

### US4 — Persistence and the Agent seam are stubbed behind interfaces (Priority: P2)
**As** an engineer, **I want** a migration runner + `personas` table + a `PersonaStore`, and the single `Agent` seam with a `MockAgent`, **so that** pillar epics plug into stable interfaces.
**Acceptance:**
- Migration runner applies numbered SQL idempotently; `0001_personas.sql` creates `personas`.
- `PersonaStore` (create/getById/list) validates rows against `PersonaSchema`; tests use in-memory SQLite.
- `Agent` interface + `MockAgent` (deterministic, returns schema-valid `Webpage`); real `AnthropicAgent` skeleton env-gated and never called in CI.

### US5 — Quality gates are enforced from commit #1 (Priority: P2)
**As** the team, **I want** zero-warning lint + a blocking CI gate, **so that** the Constitution's quality bar holds throughout build day.
**Acceptance:**
- ESLint flat config + typescript-eslint, `--max-warnings=0`; Prettier.
- `.github/workflows/ci.yml` runs `npm ci → lint → build → test:coverage` (80/70/60), **blocking**.

## Success Criteria

- `bd ready` after this epic exposes a clean dependency chain starting at `publisher-3lc.1.1`.
- A new engineer clones, runs `npm install && npm run dev`, and sees the shell page report backend health — green — within minutes.
- CI is green on the scaffold with coverage thresholds enforced.
- Build day starts on **pillars**, not setup.
