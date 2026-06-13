# Tasks — Observability Pages (User + Admin)

> TDD-shaped (Rule 1). Starts after Auth + OTel land.

## Phase 1 — user aggregation endpoint (`2p3.1`)
- [ ] **T001a** Write failing tests in `backend/tests/unit/observability-service.test.ts`: given seeded runs/metrics/checkpoints for two users, the aggregation returns, scoped to one user — total token cost across published, per-article token cost, research-loop count, failed vs published counts; does NOT leak the other user's data. RED.
- [ ] **T001b** Implement `backend/src/services/observability.service.ts` (SQLite aggregation by `userId`). GREEN.
- [ ] **T002a** Write failing integration tests: `GET /me/observability` (Bearer) returns the scoped snapshot; 401 without auth. RED.
- [ ] **T002b** Implement the route (requireAuth); register via the router registry. GREEN.

## Phase 2 — user page (`2p3.2`)
- [ ] **T003** Build `frontend/app/observability/page.tsx`: write failing RTL tests first (mocked fetch) → RED → render per-article token table + totals + research-loop + failed/published, with empty/loading/error states → GREEN.

## Phase 3 — admin aggregation endpoint (`2p3.3`)
- [ ] **T004a** Write failing tests: the admin aggregation (unscoped) returns aggregate token totals + rejected/published ratio from SQLite, and composes the OTel snapshot (inject a stub `/admin/telemetry` fetcher) for latency/phase-durations/error-counts. requireAdmin → 403 for non-admin. RED.
- [ ] **T004b** Implement `GET /admin/observability` (requireAdmin) composing SQLite aggregates + the OTel curated snapshot. GREEN.

## Phase 4 — admin page (`2p3.4`)
- [ ] **T005** Build `frontend/app/admin/observability/page.tsx` (admin-gated): failing RTL tests first → RED → mirror the user layout + add panels for avg latency, research/publish loop durations, rejected/published ratio, aggregate token totals, and the OTel error-tracking + system metrics → GREEN.

## Exit
User sees only their own costs/outcomes; admin sees system aggregates incl. the 6 OTel metrics as panels; endpoints gated; suite + coverage green.
