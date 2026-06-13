# Observability — OpenTelemetry (Operator Note)

This epic instruments the Publisher backend with [OpenTelemetry](https://opentelemetry.io/):
a curated set of **system metrics** (Prometheus) and **distributed traces** of every run
(one root span per run, child spans per phase + per checkpoint). This is the *system* layer —
it complements, and does not replace, the per-run/per-article domain numbers already in SQLite.

**It is OFF by default and is never required in CI.** When `OTEL_ENABLED` is unset or `false`,
the telemetry API is a no-op: zero behavior change, all tests deterministic and offline.
Telemetry failures never break the pipeline or block a run.

## What it adds

### Metrics (11)

All instruments are namespaced `publisher.*`. Attributes are shown in parentheses.

| # | Metric | Type | Meaning |
|---|--------|------|---------|
| 1 | `publisher.http.server.duration` | histogram (ms) | HTTP request latency, from auto-instrumentation — drives avg + p95 system latency. |
| 2 | `publisher.run.phase.duration` | histogram (ms; `phase=research\|build\|refine`) | Wall-clock per run phase — avg research-loop and build/refine-loop duration. |
| 3 | `publisher.agent.errors` | counter (`type`, `workerId`) | Agent/provider faults by type (REFUSAL, PROVIDER_ERROR, RATE_LIMITED, OUTPUT_TRUNCATED, CHECKPOINT_ERROR) — the error-tracking signal. |
| 4 | `publisher.checkpoint.failures` | counter (`gate`) | Count of failed checkpoint gates (research-sufficiency, voice-fidelity, design-conformance, quality) — gate-failure breakdown. |
| 5 | `publisher.run.outcomes` | counter (`status=published\|failed\|escalated\|awaiting_approval`) | Terminal/pause transitions per run — rejected-vs-published ratio. |
| 6 | `publisher.tokens.total` | counter (`phase`, `workerId`) | Total tokens mirrored from each agent call — live system-wide token cost. |
| 7 | `publisher.run.attempts` | histogram (1; `phase=research\|refine`) | Iterations a looping phase took before converging or hitting the cap — measures whether the bounded feedback loop converges. |
| 8 | `publisher.checkpoint.score` | histogram (0–1; `gate`) | LLM-judge score per gate vs. its threshold — the calibration view. |
| 9 | `publisher.run.duration` | histogram (ms) | End-to-end run wall-clock (start → terminal transition) — avg + p95 time to produce a page. |
| 10 | `publisher.runs.active` | UpDownCounter (1) | In-flight runs (awaiting-approval stays counted) — live system-load gauge. |
| 11 | `publisher.tokens.cached_input` | counter (`phase`, `workerId`) | Prompt-cache-hit tokens — cache-hit ratio (`cached_input / tokens.total`) for the cost-savings story. |

### Traces

One root span per run (`run`), with child spans per phase and per checkpoint.
Faults call `span.recordException()` and set span status to `ERROR`. This is the
"inner workings" view you see in Jaeger/a collector when OTLP export is enabled.

## How to enable

Set the env flag (see `.env.example`):

```bash
OTEL_ENABLED=true
```

With this on, the run engine emits spans and metrics, and the in-process Prometheus
exporter starts serving metrics.

## Where metrics are served (Prometheus)

The Prometheus exporter exposes an in-process endpoint — no external collector required:

```
http://localhost:9464/metrics
```

Point a Prometheus scrape (or just `curl`) at it to see the metrics above.

## How to view traces locally (Jaeger)

Traces stay in-process by default. To inspect them, run a local Jaeger all-in-one
(which speaks OTLP/HTTP on :4318 and serves its UI on :16686) and point the backend at it:

```bash
# 1. Start Jaeger all-in-one
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one

# 2. Tell the backend to ship traces there (with OTEL_ENABLED=true)
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces

# 3. Run a publish flow, then open the Jaeger UI
open http://localhost:16686
```

Leave `OTEL_EXPORTER_OTLP_ENDPOINT` empty to keep traces in-process only.

## CI / defaults

- Default is **OFF** (`OTEL_ENABLED=false`); the no-op path is what CI exercises.
- Telemetry is **never required in CI** and **never blocks a run** — exporter init is
  guarded, and failures are swallowed so the pipeline always proceeds.
