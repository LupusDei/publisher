# Tasks — OpenTelemetry & System Telemetry

> TDD-shaped (Rule 1). The no-op telemetry path is what CI exercises; the live OTel path is env-gated. `[P]` = parallelizable.

## Phase 1 — SDK bootstrap (`gu0.1`)
- [ ] **T001** [scaffold] Add deps: `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-prometheus`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/api`.
- [ ] **T002** Build `backend/src/telemetry/otel.ts`: phases — write a failing test that `startTelemetry()` is a no-op when `OTEL_ENABLED` is unset (and never throws) → confirm RED → implement SDK bootstrap (Prometheus exporter; optional OTLP behind env; try/catch) → confirm GREEN. Wire into `server.ts` before `createApp`.

## Phase 2 — Metrics module (`gu0.2`)
- [ ] **T003a** Write failing tests in `backend/tests/unit/telemetry-metrics.test.ts` for the injectable API: `recordError/recordPhaseDuration/recordOutcome/recordCheckpointFailure/recordTokens/startRunSpan` exist, the **no-op** impl is callable and inert, and the live impl registers the 6 instruments. Confirm RED.
- [ ] **T003b** Implement `backend/src/telemetry/metrics.ts` (the 6 instruments + typed API + `noopTelemetry`). Run to GREEN.

## Phase 3 — Engine instrumentation (`gu0.3`)
- [ ] **T004a** Write failing tests: with a **spy** telemetry dep injected into the run engine, a happy publish flow calls `recordPhaseDuration` per phase, `recordOutcome("published")`, `recordTokens` per agent call; a forced fault calls `recordError`; a failed gate calls `recordCheckpointFailure`. Confirm RED.
- [ ] **T004b** Inject the telemetry dep (no-op default) into `createRunEngine` and add the calls at the existing seams (phase loop, `metered()` catch, `recordCheckpoint` fail, `publish`/`failRun`/`escalate`/`awaitApproval`). Keep ALL existing engine tests green. GREEN.

## Phase 4 — /admin/telemetry (`gu0.4`)
- [ ] **T005a** Write failing tests in `backend/tests/integration/admin-telemetry.test.ts`: `GET /admin/telemetry` returns the curated JSON shape (latency, phase durations, errors-by-type, outcomes-by-status, token totals); admin-gated (stub guard → 200 for now, with a TODO). Confirm RED.
- [ ] **T005b** Implement `backend/src/routes/admin.ts` reading the OTel registry / in-process aggregator; register via the router registry. GREEN.

## Phase 5 — env + docs (`gu0.5`)
- [ ] **T006** [docs] Document `OTEL_ENABLED` + `OTEL_EXPORTER_OTLP_ENDPOINT` in `.env.example`; add a docs note on running a local Jaeger. Run `npm run build && npm test && npm run lint` green (OTEL disabled).

## Exit
6 metrics populate with OTEL enabled; `/admin/telemetry` returns curated JSON; CI green with OTEL disabled; OTel never blocks a run.
