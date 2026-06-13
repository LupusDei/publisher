import { z } from "zod";

/**
 * Runtime validation of process.env at boot (Constitution Rule 2 — validate at
 * boundaries, fail fast). The agent defaults to the token-free MockAgent; the
 * real Anthropic agent is only selected when USE_REAL_AGENT=true AND a key is
 * present — enforced here so a misconfigured run fails at boot, not mid-flight.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    /**
     * Vercel AI Gateway key — one key reaches every provider the gateway serves.
     * Required only to run a `gateway`-impl build worker (e.g. openai/gpt-5.4,
     * google/gemini-2.5-pro); Anthropic-backed workers use ANTHROPIC_API_KEY.
     */
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    DATABASE_PATH: z.string().min(1).default("./publisher.db"),
    USE_REAL_AGENT: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
    /**
     * Master switch for OpenTelemetry SDK bootstrap (specs/003-observability-otel).
     * When false (default), otel.ts is a no-op and the app behaves identically;
     * the api instruments in metrics.ts stay no-ops with no global provider.
     */
    OTEL_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    /**
     * Optional OTLP/HTTP traces endpoint. When set (and OTEL_ENABLED=true) the
     * SDK additionally exports spans to this collector; otherwise traces are
     * registered but not exported off-box.
     */
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().min(1).optional(),
    /**
     * Absolute base URL the Sink prepends to Receipt URLs so the Vercel
     * frontend can iframe published pages through the ngrok tunnel (D11).
     * Defaults to "" → relative `/published/:id` for local development.
     */
    PUBLIC_BASE_URL: z.string().default(""),
    /**
     * HS256 signing secret for bearer-token auth (Epic 85q). A baked-in dev
     * default keeps local/test friction-free; production MUST override it, so
     * the superRefine below fails fast if NODE_ENV=production still carries the
     * default (a real secret leaking into git would be worse than a boot error).
     */
    AUTH_JWT_SECRET: z
      .string()
      .min(1)
      .default("dev-insecure-jwt-secret-change-in-production"),
  })
  .superRefine((env, ctx) => {
    if (env.USE_REAL_AGENT && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ANTHROPIC_API_KEY"],
        message: "ANTHROPIC_API_KEY is required when USE_REAL_AGENT=true",
      });
    }
    if (
      env.NODE_ENV === "production" &&
      env.AUTH_JWT_SECRET === "dev-insecure-jwt-secret-change-in-production"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_JWT_SECRET"],
        message: "AUTH_JWT_SECRET must be set to a real secret in production",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse + validate an env source. Throws a single, readable error listing every
 * problem when the configuration is invalid.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
