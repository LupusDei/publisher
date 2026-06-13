# Plan — OpenTelemetry & System Telemetry

> Phases map to `publisher-gu0.x` beads. Full architecture in `BRIEF.md`.

## Architecture
- `backend/src/telemetry/otel.ts` — SDK bootstrap (Prometheus exporter + optional OTLP), env-gated, started before the app in `server.ts`.
- `backend/src/telemetry/metrics.ts` — the 6 instruments + a typed, **injectable** API (no-op default for CI/tests). The engine receives it as a dep.
- Engine instrumentation lives at the existing seams in `run-engine.ts` (phase loop, `metered()` fault path, `recordCheckpoint`, terminal transitions) — calls the injected telemetry API only.
- `backend/src/routes/admin.ts` — `GET /admin/telemetry`, admin-gated (stub guard until Epic 2's `requireAdmin`).

## Layering & discipline
Orchestrator imports the telemetry **interface**, never `@opentelemetry/*`. OTel is contained in `telemetry/`. Disabled = no-op everywhere → deterministic CI (Rule 1/8).

## Phases & lane
| Phase | Bead | Depends |
|---|---|---|
| 1 — SDK bootstrap | gu0.1 | — |
| 2 — Metrics module (instruments + no-op API) | gu0.2 | — |
| 3 — Engine instrumentation | gu0.3 | gu0.2 |
| 4 — /admin/telemetry endpoint | gu0.4 | gu0.2 |
| 5 — env + docs | gu0.5 | — |

**Lane (avoid collisions with parallel Auth epic):** `backend/src/telemetry/`, the engine instrumentation hooks, `backend/src/routes/admin*`, `server.ts` bootstrap, `.env.example`. Do NOT touch persona/auth/user files.

## Bead Map
- `publisher-gu0` — OpenTelemetry & System Telemetry
  - `gu0.1` SDK bootstrap · `gu0.2` metrics module · `gu0.3` engine instrumentation · `gu0.4` /admin/telemetry · `gu0.5` env+docs
