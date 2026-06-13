import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { loadEnv } from "../config/env.js";

/**
 * OpenTelemetry SDK bootstrap (specs/003-observability-otel, Pillar 4).
 *
 * This module owns the SDK side of telemetry: it registers the global
 * MeterProvider/TracerProvider that the api-level instruments in
 * telemetry/metrics.ts implicitly bind to. It MUST NOT import metrics.ts —
 * the dependency flows one way: metrics.ts reads the global @opentelemetry/api
 * meter/tracer; otel.ts installs the providers behind that global.
 *
 * Lifecycle:
 *  - When OTEL_ENABLED is not true → no-op, returns null (zero behavior change).
 *  - When enabled → NodeSDK with auto-instrumentations + a PrometheusExporter
 *    metric reader (self-serves /metrics on PROMETHEUS_PORT, default 9464) and,
 *    only when OTEL_EXPORTER_OTLP_ENDPOINT is set, an OTLP/HTTP trace exporter.
 *  - sdk.start() is wrapped in try/catch: a misconfigured exporter logs a
 *    warning and returns null rather than crashing the app at boot.
 */

const SERVICE_NAME = "publisher-backend";

/** Default port the Prometheus exporter listens on for scrapes. */
export const PROMETHEUS_PORT = 9464;

export interface OtelHandle {
  /** Flushes and shuts the SDK down; safe to call once at process exit. */
  shutdown: () => Promise<void>;
}

export interface StartOtelOptions {
  /**
   * Env source, mirroring loadEnv's signature for testability. Defaults to
   * process.env so production callers pass nothing.
   */
  env?: NodeJS.ProcessEnv;
}

/**
 * Boot the OpenTelemetry SDK when OTEL_ENABLED=true. Returns a handle with a
 * shutdown function, or null when disabled or when startup failed. Never throws.
 */
export function startOtel(options: StartOtelOptions = {}): OtelHandle | null {
  const env = loadEnv(options.env ?? process.env);

  if (!env.OTEL_ENABLED) {
    return null;
  }

  try {
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
    });

    // PrometheusExporter is itself a MetricReader and starts its own HTTP
    // server serving /metrics on PROMETHEUS_PORT.
    const metricReader = new PrometheusExporter({ port: PROMETHEUS_PORT });

    const traceExporter = env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? new OTLPTraceExporter({ url: env.OTEL_EXPORTER_OTLP_ENDPOINT })
      : undefined;

    const sdk = new NodeSDK({
      resource,
      metricReaders: [metricReader],
      instrumentations: [getNodeAutoInstrumentations()],
      ...(traceExporter ? { traceExporter } : {}),
    });

    sdk.start();

    return {
      shutdown: () =>
        sdk
          .shutdown()
          .catch((err: unknown) => console.warn("[otel] shutdown failed", err)),
    };
  } catch (err: unknown) {
    // A failed exporter (e.g. port in use, bad endpoint) must never take the
    // app down — degrade to no telemetry.
    console.warn(
      "[otel] failed to start OpenTelemetry SDK, continuing without telemetry",
      err,
    );
    return null;
  }
}
