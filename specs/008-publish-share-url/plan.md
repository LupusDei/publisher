# Plan — Publish to Shareable Preview URL (`publisher-share`)

> **How to build it.** Architecture decisions, exact file paths, phases, parallelism.
> Layered architecture: **routes → services → stores** (Constitution §4). Test-first (§1).

## Architecture decisions

### AD1 — Reachability is ops, sharing is app
The public origin (ngrok in dev, real domain in prod) is supplied by the existing
`PUBLIC_BASE_URL` env var (`backend/src/config/env.ts`). This epic builds **no tunnel
automation**. The share URL is simply `${PUBLIC_BASE_URL}/p/${slug}` (falls back to a
relative `/p/${slug}` when unset, matching the existing `/published/:id` convention).

### AD2 — Reuse the `Sink`; defer object storage
Shared HTML is fetched through the existing `Sink` (`backend/src/material/sink.ts`,
`sink.read(runId)`), which already returns the self-contained page. A future S3/R2 backend
is a new `Sink` implementation — the share store/service/routes never learn the storage
backend (Constitution §8: add the abstraction only when a third+ backend exists; the seam
already exists, so we simply do not couple to disk).

### AD3 — `shares` is its own table, slug-keyed
A new `shares` projection maps an unguessable slug to a run. It does **not** overload
`run.status`. Schema (migration `0005_shares.sql`):

```sql
CREATE TABLE shares (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,          -- url-safe, ≥16 chars, non-enumerable
  run_id      TEXT NOT NULL REFERENCES runs(id),
  owner_id    TEXT,                          -- nullable to match runs.user_id nullability
  created_at  TEXT NOT NULL,
  revoked_at  TEXT                           -- NULL = active
);
CREATE UNIQUE INDEX idx_shares_active_run ON shares(run_id) WHERE revoked_at IS NULL;
```
The partial unique index enforces **at most one active share per run** (idempotent mint).

### AD4 — Slug generation
A dedicated `slug.ts` util produces a url-safe random token (crypto-strong, ≥16 chars,
alphabet `[A-Za-z0-9_-]`). Injected (clock-style) into the store/service so tests are
deterministic. Never derived from `runId` or concept title (non-enumerable, no leak).

### AD5 — Public route is unauthenticated and uniform-404
`GET /p/:slug` mounts a router with **no auth middleware** (mirrors `publishedRouter`).
Unknown / malformed / revoked slug and missing `Sink` file all return an identical 404 —
no oracle. Owner-scoped mutations (`POST`/`DELETE /runs/:id/share`) sit under the
authed `/runs` surface and check `runStore.ownerOf(id)` against `req.user.userId`.

## Module boundaries (no logic in handlers, no SQL in services)

| Layer | New/changed file | Responsibility |
|---|---|---|
| contract | `shared/src/contracts/share.ts` | zod `ShareSchema`, `ShareLinkSchema` (`{slug,url}`) |
| util | `backend/src/util/slug.ts` | `createSlug()` — crypto url-safe token |
| store | `backend/src/stores/share.store.ts` | `create / getBySlug / getActiveByRun / revoke` (SQL only) |
| migration | `backend/migrations/0005_shares.sql` | `shares` table + partial unique index |
| service | `backend/src/services/share.service.ts` | mint (ownership + published check + idempotent), resolve-by-slug, revoke |
| routes | `backend/src/routes/share.ts` | `POST /runs/:id/share`, `DELETE /runs/:id/share`, public `GET /p/:slug` |
| composition | `backend/src/composition.ts` | construct `shareStore`, `shareService` |
| server | `backend/src/server.ts` | mount `/runs` share routes + public `/p` router |
| api client | `frontend/app/runs/run-api.ts` | `createShare / fetchShare / revokeShare` |
| component | `frontend/components/ShareLink.tsx` | button → URL + copy + open; revoke toggle |
| wire UI | `frontend/app/runs/gallery/page.tsx`, run-detail view | render `ShareLink` on each item |

## Phases (= sub-epic numbers)

### Phase 1 — Foundational: slug + share store (`share.1`)
Contract, slug util, migration, store. No HTTP yet. **Blocks everything.**

### Phase 2 — US1: mint + public serve (`share.2`, depends `share.1`)
`share.service` (mint + resolveBySlug), `POST /runs/:id/share`, public `GET /p/:slug`,
wire into composition + server. **The MVP** — a link exists and loads.

### Phase 3 — US2: gallery / run-detail UI (`share.3`, depends `share.2`)
`run-api` calls, `ShareLink` component, wire into gallery card + run detail.

### Phase 4 — US3: revoke (`share.4`, depends `share.2`)
`share.service.revoke`, `DELETE /runs/:id/share`, public route honors revoke, UI toggle.

### Phase 5 — Polish: docs + e2e (`share.5`, depends `share.3`, `share.4`)
`PUBLIC_BASE_URL` + ngrok dev recipe in docs; e2e integration mint→fetch→revoke→404.

## Parallel opportunities
- Phase 1: contract `share.ts`, slug `slug.ts`, and the migration are independent `[P]`.
- Phase 2: route handler and public router can be authored in parallel once the service
  interface is fixed; both depend on the service test landing first.
- Phase 3 (frontend) and Phase 4 (backend revoke) are independent tracks once Phase 2
  lands — a frontend agent and a backend agent can run concurrently in worktrees.

## Risks
- **Slug collision** — mitigated by ≥16-char crypto token + UNIQUE constraint + retry on
  the (astronomically rare) insert conflict.
- **Stale `Sink` file** — the page exists only on the backend's disk; a future S3/R2 `Sink`
  removes this fragility. For now, missing file → 404 (handled), not 500.
- **Open-redirect / XSS via slug** — slug is validated against `^[A-Za-z0-9_-]{16,}$` before
  any lookup; the served HTML is the run's own already-sanitized output (unchanged surface).

## Bead Map

- `publisher-share` — Root epic: Publish to Shareable Preview URL
  - `publisher-share.1` — Foundational: slug + share store
    - `publisher-share.1.1` — [setup] migration 0005_shares.sql
    - `publisher-share.1.2` — [TDD] slug generator (url-safe, non-enumerable)
    - `publisher-share.1.3` — [TDD] share contract (ShareSchema, ShareLinkSchema)
    - `publisher-share.1.4` — [TDD] share.store.ts ← 1.1, 1.3
  - `publisher-share.2` — US1: mint + public serve (MVP) ← share.1
    - `publisher-share.2.1` — [TDD] share.service.ts (mint + resolveBySlug) ← 1.2, 1.4
    - `publisher-share.2.2` — [TDD] POST /runs/:id/share ← 2.1
    - `publisher-share.2.3` — [TDD] public GET /p/:slug ← 2.1
    - `publisher-share.2.4` — [TDD] wire composition + server ← 2.2, 2.3
  - `publisher-share.3` — US2: gallery / run-detail UI ← share.2
    - `publisher-share.3.1` — [TDD] run-api createShare/fetchShare/revokeShare ← 2.4
    - `publisher-share.3.2` — [TDD] ShareLink component ← 3.1
    - `publisher-share.3.3` — [TDD] wire ShareLink into gallery + run detail ← 3.2
  - `publisher-share.4` — US3: revoke a share ← share.2
    - `publisher-share.4.1` — [TDD] share.service.revoke ← 2.1
    - `publisher-share.4.2` — [TDD] DELETE /runs/:id/share ← 4.1, 2.4
    - `publisher-share.4.3` — [TDD] ShareLink revoke toggle ← 3.2, 4.2
  - `publisher-share.5` — Polish: docs + e2e ← share.3, share.4
    - `publisher-share.5.1` — [docs] PUBLIC_BASE_URL + ngrok dev recipe ← 2.4
    - `publisher-share.5.2` — [TDD] e2e mint→serve→revoke→404 ← 3.3, 4.3
