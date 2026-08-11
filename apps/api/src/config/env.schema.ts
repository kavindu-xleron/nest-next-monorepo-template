import { z } from "zod"

/**
 * Every environment variable the API reads, validated once at boot.
 *
 * Two rules worth knowing before editing this file:
 *
 * - `@nestjs/config` replaces its entire config object with whatever `validate`
 *   returns, and `z.object` strips keys it does not declare. A variable missing
 *   from this schema is therefore invisible to `ConfigService`, no matter how
 *   faithfully it is set in `.env`. Declare it here first.
 * - Defaults belong here and nowhere else. A default repeated at a
 *   `configService.get(key, fallback)` call site is a second source of truth,
 *   and the two drift without anything failing loudly.
 */

/** Vars that may be absent while developing but must exist in a real deployment. */
const REQUIRED_IN_PRODUCTION = [
  "DATABASE_URL",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
] as const

const port = z.coerce.number().int().min(1).max(65_535)
const durationMs = z.coerce.number().int().nonnegative()

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: port.default(5001),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),

    /** How long readiness reports failing before we stop accepting connections. */
    DRAIN_INTERVAL_MS: durationMs.default(5000),
    /** Deadline for the whole shutdown sequence before the process is forced out. */
    SHUTDOWN_TIMEOUT_MS: durationMs.default(30_000),

    DATABASE_URL: z.string().url().optional(),
    CLERK_SECRET_KEY: z.string().min(1).optional(),
    CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
    CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),

    CORS_ORIGIN: z.string().default("*"),
    THROTTLE_TTL_MS: durationMs.default(60_000),
    THROTTLE_LIMIT: z.coerce.number().int().min(1).default(100),
  })
  .superRefine((env, ctx) => {
    // The drain runs *inside* the shutdown deadline. Configured the other way
    // round, the force-exit fires while we are still draining, so every
    // shutdown is a hard kill and in-flight requests are cut off.
    if (env.DRAIN_INTERVAL_MS >= env.SHUTDOWN_TIMEOUT_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["DRAIN_INTERVAL_MS"],
        message: `must be less than SHUTDOWN_TIMEOUT_MS (${env.SHUTDOWN_TIMEOUT_MS}), otherwise shutdown is forced before the drain completes`,
      })
    }

    if (env.NODE_ENV !== "production") {
      return
    }

    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!env[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "is required when NODE_ENV=production",
        })
      }
    }
  })

export type Env = z.infer<typeof envSchema>

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config)

  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${JSON.stringify(result.error.format(), null, 2)}`
    )
  }

  return result.data
}
