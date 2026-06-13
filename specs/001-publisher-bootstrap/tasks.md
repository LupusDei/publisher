# Tasks — Publisher Bootstrap

`[P]` = parallelizable (different files, no blocking dep). `[TDD]` = tests first.
T-IDs are authoring labels; see `beads-import.md` for the T-ID → bead-ID map.

## Phase 1 — Workspace Foundation (`publisher-3lc.1`)

- [ ] **T001** Scaffold npm-workspaces monorepo — `publisher-3lc.1.1`
  Root `package.json` with `workspaces: [backend, frontend, shared]`; `.nvmrc` (Node 20); `.gitignore` (node_modules, dist, .next, *.db, .env); placeholder `package.json` in each workspace.
  *Done when:* `npm install` links all three; `npm ls --workspaces` resolves.
- [ ] **T002** Shared TS strict base config — `publisher-3lc.1.2` *(needs T001)*
  `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); each workspace `tsconfig.json` extends it.
  *Done when:* `tsc --noEmit` clean per workspace.

## Phase 2 — Shared Contracts (`publisher-3lc.2`)

- [ ] **T003 [TDD]** Zod contracts + inferred types — `publisher-3lc.2.1` *(needs T002)*
  `shared/src/contracts/{webpage,persona,alarm}.ts` — Zod schema + inferred type each. `Webpage{title,html,css,summary,sourcesUsed[]}`, `Persona{id,name,voice,stylePoints[],keyLearnings[],designElements}`, `Alarm{type,severity,context,recommendedAction}`.
  *Tests first:* `shared/tests/unit/contracts.test.ts` — valid parse / invalid rejected / edge (empty arrays, missing optional) per schema.

## Phase 3 — Backend Scaffold (`publisher-3lc.3`)

- [ ] **T004** Backend skeleton — `publisher-3lc.3.1` *(needs T002)* `[P]` with T006, T008
  Express factory `src/app.ts` + boot `src/server.ts`; dirs `routes/ services/ stores/`; `vitest.config.ts` with coverage 80/70/60.
  *Done when:* `npm run build` exits 0; `npm test` runs.
- [ ] **T005 [TDD]** Env validation + `.env.example` — `publisher-3lc.3.2` *(needs T004)*
  `src/config/env.ts` — Zod-validate `process.env` at boot (fail-fast): `NODE_ENV, PORT=4000, ANTHROPIC_API_KEY?, DATABASE_PATH=./publisher.db, USE_REAL_AGENT=false`. `.env.example` documents all.
  *Tests first:* `backend/tests/unit/env.test.ts` — valid / missing-invalid throws / defaults.
- [ ] **T006 [TDD]** Health endpoint vertical slice — `publisher-3lc.3.3` *(needs T004)*
  `GET /health` → `routes/health.ts` → `services/health.service.ts` → `{status:"ok",version,uptime}`; CORS for FE origin.
  *Tests first:* `tests/integration/health.test.ts` (supertest, 2+) + `tests/unit/health.service.test.ts` (3).

## Phase 4 — Frontend Scaffold (`publisher-3lc.4`)

- [ ] **T007** Next.js scaffold (Vitest + RTL) — `publisher-3lc.4.1` *(needs T002)* `[P]` with T004, T003
  Next.js App Router + TS strict; Vitest + `@testing-library/react` + jsdom; `app/layout.tsx`, `app/page.tsx` placeholder.
  *Done when:* `next build` exits 0; trivial RTL render test passes.
- [ ] **T008 [TDD]** Health shell page (FE↔BE seam) — `publisher-3lc.4.2` *(needs T007 + T006)*
  `app/page.tsx` fetches `/health` via `lib/api.ts` (`NEXT_PUBLIC_API_BASE`); renders loading / success / error; status via `aria-live`.
  *Tests first:* `tests/unit/health-shell.test.tsx` — initial-loading / success / error, fetch mocked.

## Phase 5 — Persistence Foundation (`publisher-3lc.5`)

- [ ] **T009 [TDD]** SQLite driver + migration runner — `publisher-3lc.5.1` *(needs T004)*
  better-sqlite3 behind store boundary (`src/stores/db.ts`); `src/stores/migrate.ts` applies numbered `migrations/*.sql`, tracks in `_migrations`, idempotent, run at boot.
  *Tests first:* `tests/unit/migrate.test.ts` — applies pending / skips applied / surfaces errors.
- [ ] **T010 [TDD]** Personas table + PersonaStore — `publisher-3lc.5.2` *(needs T009 + T003)*
  `migrations/0001_personas.sql`; `PersonaStore` interface + impl (`create/getById/list`), validates rows vs `PersonaSchema`.
  *Tests first:* `tests/unit/persona.store.test.ts` — in-memory db, 3+/method (happy / not-found / edge empty list).

## Phase 6 — Agent Seam Stub (`publisher-3lc.6`)

- [ ] **T011 [TDD]** Agent interface + MockAgent — `publisher-3lc.6.1` *(needs T004 + T003)*
  `src/agent/agent.ts` — `interface Agent { research(persona,concept); build(persona,research,feedback?) }` (`Webpage` from shared). `mock-agent.ts` deterministic, token-free, schema-valid output.
  *Tests first:* `tests/unit/mock-agent.test.ts` — research returns sources / build returns valid Webpage / feedback alters output.
- [ ] **T012** AnthropicAgent skeleton (env-gated) — `publisher-3lc.6.2` *(needs T011 + T005)*
  `src/agent/anthropic-agent.ts` (ai + @ai-sdk/anthropic per `docs/agent-integration.md`): `research()` `generateText` + web tools; `build()` `generateObject(WebpageSchema)`. Factory `src/agent/index.ts` selects real only when `USE_REAL_AGENT && ANTHROPIC_API_KEY`. **Never calls live API in CI.** Verify SDK tool-version tags against installed package.

## Phase 7 — Dev Tooling & CI (`publisher-3lc.7`)

- [ ] **T013** ESLint flat + Prettier + root scripts — `publisher-3lc.7.1` *(needs T001)*
  `eslint.config.js` (typescript-eslint, `--max-warnings=0`), `.prettierrc`; root scripts `build/test/test:coverage/lint/dev` fan out to workspaces (`dev` runs BE+FE concurrently).
  *Done when:* `npm run lint` exits 0 zero-warning; `npm run dev` boots both.
- [ ] **T014** GitHub Actions CI gate — `publisher-3lc.7.2` *(needs T013 + T004 + T007)*
  `.github/workflows/ci.yml`: `npm ci → lint → build → test:coverage` (80/70/60), **blocking**, Node from `.nvmrc`.
  *Done when:* workflow green on the scaffold.

## Suggested Execution Waves

1. **Wave 0:** T001 → T002  *(serial gate)*
2. **Wave 1 (parallel):** T003 · T004 · T007 · T013
3. **Wave 2 (parallel):** T005 · T006 · T009 · T011
4. **Wave 3 (parallel):** T008 · T010 · T012
5. **Wave 4:** T014  *(CI ties it together)*
