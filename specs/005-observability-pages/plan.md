# Plan — Observability Pages (User + Admin)

> Phases map to `publisher-2p3.x` beads. Starts after Auth + OTel land.

## Architecture
- **User aggregation** `backend/src/services/observability.service.ts` — pure SQLite aggregation over `runs` + `metrics` + `checkpoints` filtered by `userId`: total + per-article token cost (published webpages), research-loop counts, failed/published counts. Exposed at `GET /me/observability` (requireAuth).
- **Admin aggregation** same service, unscoped (all rows) for token totals + rejected/published ratio, **composed with** the OTel curated snapshot from `GET /admin/telemetry` (Epic 1) for latency, phase-duration averages, and error tracking. Exposed at `GET /admin/observability` (requireAdmin).
- **Frontend** `frontend/app/observability` (user) and `frontend/app/admin/observability` (admin) — tables + simple bar/sparkline components; reuse the alarm/severity styling for error panels. Admin route guarded by role.

## Architecture notes
- Single boundary: this epic **reads** (SQLite + OTel endpoint); it adds no instrumentation. Keeps OTel and domain metering as the single sources (no third copy).
- The admin page = the user layout + extra panels, so build the user page first and extend.

## Phases
| Phase | Bead | Depends |
|---|---|---|
| 1 — user aggregation endpoint | 2p3.1 | `85q.4` (ownership) |
| 2 — user page | 2p3.2 | 2p3.1 |
| 3 — admin aggregation endpoint | 2p3.3 | `gu0.4` (/admin/telemetry) + `85q.3` (requireAdmin) |
| 4 — admin page | 2p3.4 | 2p3.3 |

## Bead Map
- `publisher-2p3` — Observability Pages (User + Admin)
  - `2p3.1` user endpoint · `2p3.2` user page · `2p3.3` admin endpoint (+OTel) · `2p3.4` admin page
