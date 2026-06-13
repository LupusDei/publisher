# Plan — Publisher Bootstrap

> How to build the scaffold. Phases map 1:1 to bead sub-epics. **Phase N = sub-epic `publisher-3lc.N`.**

## Target Layout

```
publisher/
├── package.json            # npm workspaces: backend, frontend, shared + root scripts
├── tsconfig.base.json      # strict TS base, extended by each workspace
├── eslint.config.js        # flat config, typescript-eslint, --max-warnings=0
├── .prettierrc
├── .nvmrc                  # Node 20 LTS
├── .env.example            # every env key documented
├── .github/workflows/ci.yml
├── shared/                 # cross-tier contracts (Zod source of truth + inferred types)
│   ├── src/contracts/{webpage,persona,alarm}.ts
│   ├── src/index.ts
│   └── tests/unit/contracts.test.ts
├── backend/                # Node + TS + Express, layered
│   ├── src/
│   │   ├── app.ts          # Express factory      (handlers wired here)
│   │   ├── server.ts       # boot + env validate + migrate
│   │   ├── config/env.ts   # Zod-validated process.env
│   │   ├── routes/         # handlers — NO business logic (Rule 4)
│   │   ├── services/       # business logic
│   │   ├── stores/         # data access: db.ts, migrate.ts, persona.store.ts
│   │   └── agent/          # agent.ts (seam), mock-agent.ts, anthropic-agent.ts, index.ts (factory)
│   ├── migrations/0001_personas.sql
│   ├── tests/unit/         # *.test.ts
│   └── tests/integration/  # *.test.ts (supertest)
└── frontend/               # Next.js App Router
    ├── app/{layout.tsx,page.tsx}
    ├── lib/api.ts          # typed client → NEXT_PUBLIC_API_BASE
    └── tests/{setup.ts,unit/*.test.tsx}
```

## Architecture Notes

- **Layered (Rule 4):** routes import services; services import stores; stores own SQLite. Handlers contain no logic; stores expose no Express types.
- **Contracts as source of truth:** `shared/` defines Zod schemas once; both tiers infer types from them and validate at boundaries (Rule 2). No hand-maintained duplicate interfaces.
- **One Agent seam:** everything agent-related lives behind `backend/src/agent/agent.ts`. The orchestrator (future) only ever sees this interface → swappability bonus is free.
- **Driver behind an interface:** `PersonaStore` is an interface; the better-sqlite3 implementation is one file. Turso/libSQL later = a second implementation, no caller changes.
- **Token discipline:** `agent/index.ts` factory returns `MockAgent` unless `USE_REAL_AGENT=true && ANTHROPIC_API_KEY`. CI never touches the network agent.

## Phases & Parallelism

| Phase | Sub-epic | Depends on | Parallel with |
|---|---|---|---|
| 1 — Workspace Foundation | `publisher-3lc.1` | — | — (gates everything) |
| 2 — Shared Contracts | `publisher-3lc.2` | Phase 1 | Phase 3, 4 |
| 3 — Backend Scaffold | `publisher-3lc.3` | Phase 1 | Phase 2, 4 |
| 4 — Frontend Scaffold | `publisher-3lc.4` | Phase 1 (4.2 also needs 3.3) | Phase 2, 3 |
| 5 — Persistence Foundation | `publisher-3lc.5` | Phase 3 + 2 | Phase 6 |
| 6 — Agent Seam Stub | `publisher-3lc.6` | Phase 3 + 2 | Phase 5 |
| 7 — Dev Tooling & CI | `publisher-3lc.7` | Phase 1; 7.2 also needs 3 + 4 | — (ties together) |

**Critical path:** 1.1 → 1.2 → 3.1 → {3.3 → 4.2} / {5.x, 6.x} → 7.2.
**Widest fan-out:** after `1.2`, Phases 2, 3, and 4.1 proceed in parallel (3 tracks).

> **Concurrency note (Constitution Rule 7):** any concurrent agents implementing these tasks MUST run with `isolation: "worktree"` since they edit shared files (root `package.json`, configs).

## TDD Expectation (Rule 1)

Every task tagged **[TDD]** writes failing tests first (Red → Green → Refactor). Minimums: 3 tests/service method, 2/endpoint, 3/hook, valid+invalid+edge per schema. Mock data uses **real output shapes**, not type stubs.

## Bead Map

- `publisher-3lc` — Root: Publisher Bootstrap — Scaffold & Project Init
  - `publisher-3lc.1` — Phase 1: Workspace Foundation
    - `publisher-3lc.1.1` — Scaffold npm-workspaces monorepo  *(entry point — only initially-ready task)*
    - `publisher-3lc.1.2` — Shared TypeScript strict base config
  - `publisher-3lc.2` — Phase 2: Shared Contracts
    - `publisher-3lc.2.1` — [TDD] Zod contracts + inferred types (Webpage, Persona, Alarm)
  - `publisher-3lc.3` — Phase 3: Backend Scaffold
    - `publisher-3lc.3.1` — Backend skeleton — Express, layered dirs, Vitest+coverage
    - `publisher-3lc.3.2` — [TDD] Env validation module + .env.example
    - `publisher-3lc.3.3` — [TDD] Health endpoint vertical slice (GET /health)
  - `publisher-3lc.4` — Phase 4: Frontend Scaffold
    - `publisher-3lc.4.1` — Next.js + React + TS strict scaffold (Vitest + RTL)
    - `publisher-3lc.4.2` — [TDD] Health shell page — proves FE↔BE seam
  - `publisher-3lc.5` — Phase 5: Persistence Foundation
    - `publisher-3lc.5.1` — [TDD] SQLite driver + migration runner
    - `publisher-3lc.5.2` — [TDD] Personas table migration + PersonaStore
  - `publisher-3lc.6` — Phase 6: Agent Seam Stub
    - `publisher-3lc.6.1` — [TDD] Agent interface + deterministic MockAgent
    - `publisher-3lc.6.2` — AnthropicAgent skeleton (Vercel AI SDK, env-gated)
  - `publisher-3lc.7` — Phase 7: Dev Tooling & CI
    - `publisher-3lc.7.1` — ESLint flat config + Prettier + root npm scripts
    - `publisher-3lc.7.2` — GitHub Actions CI — blocking lint+build+coverage gate
