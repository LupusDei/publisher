# Spec — OpenTelemetry & System Telemetry (Epic `publisher-gu0`)

> **Owner:** Kerrigan · **Companion:** `BRIEF.md` (architecture + the 6 metrics, definitive) · **Do FIRST** (gates the admin observability page).

## Problem
The harness meters domain data (token cost per run) into SQLite, but we have no view into the **system's inner workings** — request latency, run/phase traces, exceptions, error rates by type. The admin observability page needs **error tracking** and system-level metrics that SQLite doesn't capture. OpenTelemetry provides traces + exception capture + a curated metric set, exposed for the admin page.

## Non-Goals
- Replacing the SQLite domain metrics (per-user/per-article token cost stays there — Epic 5 reads it).
- Standing up Grafana/full collector for the demo (OTLP traces are optional/env-gated).
- The admin page UI itself (Epic 5) — this epic only exposes the data.

## Locked decisions
- `@opentelemetry/sdk-node` + auto-instrumentations; **Prometheus exporter** in-process (`/metrics`); optional OTLP traces behind `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Env-gated by `OTEL_ENABLED` (off in test/CI → deterministic, offline). OTel failures must never break a run (try/catch).
- Engine talks to a thin injectable `telemetry` module (no-op default) — the orchestrator never imports OTel directly (same discipline as the pillars).

## User Stories

### US1 — System is traced and metered (Priority: P1) — beads `gu0.1`, `gu0.2`, `gu0.3`
**As** an operator, **I want** every run + HTTP request traced and the 6 key metrics recorded, **so that** I can see latency, durations, errors, and outcomes.
**Acceptance:** with `OTEL_ENABLED=true`, a publish flow populates `http.server.duration`, `run.phase.duration`, `agent.errors`, `checkpoint.failures`, `run.outcomes`, `tokens.total`; a run emits a root `run` span with phase/checkpoint children; exceptions are recorded on spans. With OTEL unset, zero behavior change and all existing tests green.

### US2 — Curated metrics are queryable for the admin page (Priority: P1) — bead `gu0.4`
**As** the admin observability page (Epic 5), **I want** `GET /admin/telemetry` returning a clean JSON snapshot (latency avg/p95, phase-duration avgs, error counts by type, outcomes by status, token totals), **so that** I can render error tracking + system insights.
**Acceptance:** endpoint returns the curated snapshot; gated by `requireAdmin` (stubbed until Epic 2 lands); 2+ tests.

### US3 — Operable & documented (Priority: P2) — bead `gu0.5`
**Acceptance:** `OTEL_ENABLED` + `OTEL_EXPORTER_OTLP_ENDPOINT` documented in `.env.example`; a docs note on running a local Jaeger for traces.

## Success Criteria
- The 6 metrics populate on a real flow; `/admin/telemetry` returns curated JSON; CI green with OTEL disabled; OTel never blocks the pipeline.
