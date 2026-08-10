import { z } from "zod"

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(5001),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  DRAIN_INTERVAL_MS: z.coerce.number().default(5000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(30000),
  DATABASE_URL: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
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
