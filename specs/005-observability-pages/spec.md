# Spec — Observability Pages (User + Admin) (Epic `publisher-2p3`)

> **Depends on:** Auth (`publisher-85q`, per-user scoping + admin role) and OpenTelemetry (`publisher-gu0`, error tracking + system metrics).
> **Data boundary:** domain numbers (token cost, loop counts, outcomes) from **SQLite** projections; error tracking + system metrics from **OTel** (`/admin/telemetry`).

## Problem
Users can't see what their publishing is costing or how it's performing, and operators have no aggregate view. We need two mirrored observability surfaces: a **per-user** page (your own costs + outcomes) and an **admin** page (system-wide aggregates + error tracking).

## Non-Goals
- Re-instrumenting the system (OTel epic owns metrics/traces; this epic only reads + renders).
- Billing/invoicing (we display token cost, not money).
- Real-time charts beyond what the existing run-event stream offers (these pages are snapshot/aggregate views).

## User Stories

### US1 — My observability page (Priority: P2) — beads `2p3.1`, `2p3.2`
**As** a user, **I want** a page showing my token costs and outcomes, **so that** I understand what my publishing costs and how often it succeeds.
**Acceptance:** `GET /me/observability` (requireAuth, scoped to `req.user.id`) returns: total token cost across my published articles; per-article token cost; number of research loops (per run + total); failed vs published article counts. The page renders these (tables/simple charts) with empty/loading/error states. Numbers come from SQLite (`runs`/`metrics`/`checkpoints`) filtered by `userId`.

### US2 — Admin observability page (Priority: P2) — beads `2p3.3`, `2p3.4`
**As** an admin, **I want** a mirrored aggregate page, **so that** I can see system health.
**Acceptance:** `GET /admin/observability` (requireAdmin) returns aggregates: average system latency; average research-loop and build/publish-loop duration; rejected-vs-published ratio; aggregate token totals across all users; **error tracking** (counts by type) and the OTel system metrics. Domain aggregates come from SQLite across all runs; latency/durations/errors come from OTel (`/admin/telemetry`). The page mirrors the user layout plus the error-tracking + system panels; admin-only route.

## Success Criteria
- A user sees their own (and only their own) costs/outcomes; an admin sees system-wide aggregates including the 6 OTel metrics surfaced as panels (latency, phase durations, agent errors, checkpoint failures, run outcomes, token totals). Full suite + coverage green; endpoints correctly gated.
