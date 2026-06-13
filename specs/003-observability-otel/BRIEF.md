# Brief — OpenTelemetry & System Telemetry (Epic 1)

> **Owner:** Kerrigan · **Author:** Tassadar · **Status:** handoff brief
> **Do this one FIRST** — the admin observability page (Epic 3) consumes the error tracking + system metrics defined here.

## Goal
Instrument Publisher's backend with OpenTelemetry so we get genuine insight into the **inner workings of the system** — distributed traces of every run, exception/error capture, and a curated set of **system metrics**. This is distinct from the harness's domain metering (token cost per run already lives in SQLite). OTel adds the *system* layer and is the source for the admin page's **error tracking**.

## The boundary (read this — it prevents overlap with the obs-page epics)
| Concern | Owner | Source |
|---|---|---|
| Per-user / per-article token cost, research-loop counts, failed-vs-published | **Domain** (SQLite: `runs`, `metrics`, `alarms`, `checkpoints`) | already persisted by Pillar 4 / the run engine |
| Traces/spans, exception capture, system latency, error counters by type | **OpenTelemetry** (this epic) | new instrumentation |
| Admin error tracking + system-latency / loop-duration insights | reads **OTel** (via a backend endpoint) | this epic exposes it |

OTel does **not** replace the SQLite metrics. It **adds** spans + error/system metrics and exposes a small read endpoint the admin page calls. Token/latency domain numbers the obs pages need still come from SQLite.

## Tech choices (pragmatic for our stack: Node/TS Express, local backend behind ngrok)
- `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node` (auto HTTP/Express spans).
- Metrics via `@opentelemetry/api` (a `Meter` from a `MeterProvider`).
- **Exporter:** `@opentelemetry/exporter-prometheus` — exposes an in-process `/metrics` endpoint (no external collector required for the demo). Keep an **optional** OTLP trace exporter (`@opentelemetry/exporter-trace-otlp-http`) behind an env flag (`OTEL_EXPORTER_OTLP_ENDPOINT`) so traces can go to a Jaeger/collector when one is available — env-gated, off by default, never required in CI.
- Bootstrap in a dedicated `backend/src/telemetry/otel.ts`, started **before** the app in `server.ts` (instrumentation must wrap http first). Guard with `OTEL_ENABLED` (default off in test/CI so unit tests stay deterministic and offline).
- Keep it behind a thin `telemetry/` module with a tiny API the engine calls (`recordError`, `startRunSpan`, `recordPhaseDuration`, …) so the orchestrator does not import OTel directly (same discipline as the pillars — keep the worker/engine clean).

## The key metrics (each MUST be surfaced on the admin page — Epic 3)
Create these six. Names are namespaced `publisher.*`; attributes in parens.

1. **`publisher.http.server.duration`** (histogram, ms) — from auto-instrumentation. → admin: **avg + p95 system latency**.
2. **`publisher.run.phase.duration`** (histogram, ms; attr `phase=research|build|refine`) — recorded by the engine per phase. → admin: **avg research-loop duration** and **avg build/publish-loop duration**.
3. **`publisher.agent.errors`** (counter; attr `type=REFUSAL|PROVIDER_ERROR|RATE_LIMITED|OUTPUT_TRUNCATED|CHECKPOINT_ERROR`, `workerId`) — the **error tracking** signal; incremented wherever the engine maps a fault/finishReason to an alarm. → admin: **error tracking breakdown by type**.
4. **`publisher.checkpoint.failures`** (counter; attr `gate=research-sufficiency|voice-fidelity|design-conformance|quality`) — per failed gate. → admin: **gate-failure breakdown** (and feeds rejected-rate).
5. **`publisher.run.outcomes`** (counter; attr `status=published|failed|escalated|awaiting_approval`) — incremented on each terminal/pause transition. → admin: **rejected-vs-published ratio**.
6. **`publisher.tokens.total`** (counter; attr `phase`, `workerId`) — mirrors per-call usage into OTel. → admin: **aggregate token cost** (live, system-wide).

Plus **traces**: one root span per run (`run`), child spans per phase + per checkpoint, with `span.recordException()` on faults and span status set to ERROR. This is the "inner workings" view in a collector/Jaeger when OTLP is enabled.

## Where to instrument (seams)
- **HTTP**: auto-instrumentation (no code).
- **Run engine** (`backend/src/orchestrator/run-engine.ts`): start a run span in `start()`; wrap each phase in a child span and record `run.phase.duration`; on the `metered()` fault path call `telemetry.recordError(type, workerId)` and `span.recordException`; on each `recordCheckpoint` failure increment `checkpoint.failures`; on terminal transitions (`publish`/`failRun`/`escalate`/`awaitApproval`) increment `run.outcomes`; mirror each agent call's `usage` into `tokens.total`. Inject the telemetry module as a dep so tests can pass a no-op.
- **Exception hook**: a thin Express error middleware that records unhandled errors to OTel as a fallback.

## What you deliver
1. `backend/src/telemetry/otel.ts` — SDK bootstrap (Prometheus exporter + optional OTLP), env-gated (`OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`), no-op when disabled.
2. `backend/src/telemetry/metrics.ts` — the six instruments + a small typed API (`recordError`, `recordPhaseDuration`, `recordOutcome`, `recordCheckpointFailure`, `recordTokens`, `startRunSpan`). Injectable; a no-op default for tests.
3. Engine instrumentation (the seams above) behind the injected telemetry dep — **keep all existing tests green**; the no-op default means deterministic CI.
4. `GET /admin/telemetry` — a read endpoint returning the curated metric snapshot the admin page renders (latency avg/p95, phase-duration avgs, error counts by type, outcomes by status, token totals). It can read OTel's own metric reader (Prometheus registry) or hold a small in-process aggregator the instruments update — your call; just return clean JSON. **Gate it behind the admin role** (Epic 2 supplies `requireAdmin`; until then, stub the guard and leave a TODO).
5. `.env.example` additions (`OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`) + a short `docs` note on running a local Jaeger if you want traces.

## Constraints
- Constitution applies: TDD (the telemetry module + the `/admin/telemetry` endpoint get tests; the no-op path is what CI exercises), strict TS, layered, simplicity.
- **Never required in CI / never blocks a run** — OTel failures must not break the pipeline (wrap exporter init in try/catch; default disabled in test).
- Coordinate the one shared touchpoint: you'll add the run-engine instrumentation hooks. Auth (Epic 2, Tassadar) is editing routes/stores in parallel — your lane is `backend/src/telemetry/`, the engine instrumentation calls, `routes/admin*`, and `server.ts` bootstrap. Avoid persona/auth files.

## Definition of done
- `OTEL_ENABLED=true` → `/metrics` serves the six metrics; running a publish flow populates them; `/admin/telemetry` returns the curated JSON.
- `OTEL_ENABLED` unset → zero behavior change, all existing tests green.
- A run produces a trace (root `run` span + phase/checkpoint children) visible in a collector when OTLP is configured.
