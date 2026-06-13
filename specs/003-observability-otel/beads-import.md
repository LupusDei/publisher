# Beads Import — OpenTelemetry (maps to EXISTING beads)

> Created in beads; do not re-create. Owner: Valerian.

| Bead ID | Title | T-IDs | Type | Pri |
|---|---|---|---|---|
| `publisher-gu0` | OpenTelemetry & System Telemetry | — | epic | P1 |
| `publisher-gu0.1` | OTel SDK bootstrap (Prometheus + optional OTLP, env-gated) | T001–T002 | task | P1 |
| `publisher-gu0.2` | [TDD] Telemetry metrics module (6 instruments + no-op API) | T003 | task | P1 |
| `publisher-gu0.3` | [TDD] Run-engine instrumentation (injected dep) | T004 | task | P1 |
| `publisher-gu0.4` | [TDD] GET /admin/telemetry curated endpoint | T005 | task | P1 |
| `publisher-gu0.5` | .env + docs | T006 | task | P2 |

**Deps:** `gu0.3 → gu0.2`, `gu0.4 → gu0.2`. **Downstream:** `publisher-2p3.3` (admin obs endpoint) depends on `gu0.4`; epic `publisher-2p3` depends on `publisher-gu0`.
