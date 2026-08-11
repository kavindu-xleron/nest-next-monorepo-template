import { z } from "zod"

/**
 * Validated environment for the web app, mirroring the API's fail-fast approach.
 *
 * Each `NEXT_PUBLIC_*` variable is read as a full static property access rather
 * than by iterating `process.env`. Next inlines these at build time by literal
 * textual substitution, so `process.env[key]` or spreading `process.env` yields
 * `undefined` in the browser bundle no matter how the value is set.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, "Clerk publishable key is required"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:5001"),
})

const parsed = clientEnvSchema.safeParse({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
})

if (!parsed.success) {
  throw new Error(
    `Invalid web environment variables:\n${JSON.stringify(
      parsed.error.flatten().fieldErrors,
      null,
      2
    )}`
  )
}

export const env = parsed.data

/** Base URL for the versioned API, e.g. http://localhost:5001/api/v1 */
export const API_BASE_URL = `${env.NEXT_PUBLIC_API_URL}/api/v1`
