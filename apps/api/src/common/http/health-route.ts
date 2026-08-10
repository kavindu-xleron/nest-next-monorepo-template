/**
 * Health endpoints are polled continuously by the platform, and a readiness
 * check that fails during a drain is the system working as designed rather than
 * an incident. Both the pino request logger and the exception filter therefore
 * stay quiet about them.
 *
 * The test lives here rather than inline in each caller because the two are
 * asserting the same thing from opposite ends, and they have to move together
 * when the API picks up a global `/api/v1` prefix.
 */
export const HEALTH_ROUTE_SEGMENT = "health"

/** Matches `/health`, `/health/ready`, and prefixed forms like `/api/v1/health/live`. */
const HEALTH_PATH_PATTERN = new RegExp(
  `(?:^|/)${HEALTH_ROUTE_SEGMENT}(?:/[^/]*)?$`
)

export function isHealthRoute(url: string | undefined): boolean {
  if (!url) {
    return false
  }

  const [path = ""] = url.split("?")
  return HEALTH_PATH_PATTERN.test(path)
}
