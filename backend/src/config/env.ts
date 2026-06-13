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
    DATABASE_PATH: z.string().min(1).default("./publisher.db"),
    USE_REAL_AGENT: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
    /**
     * Absolute base URL the Sink prepends to Receipt URLs so the Vercel
     * frontend can iframe published pages through the ngrok tunnel (D11).
     * Defaults to "" → relative `/published/:id` for local development.
     */
    PUBLIC_BASE_URL: z.string().default(""),
  })
  .superRefine((env, ctx) => {
    if (env.USE_REAL_AGENT && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ANTHROPIC_API_KEY"],
        message: "ANTHROPIC_API_KEY is required when USE_REAL_AGENT=true",
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
