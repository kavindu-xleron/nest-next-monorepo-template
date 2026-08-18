import { isHealthRoute } from "./health-route"

describe("isHealthRoute", () => {
  it.each(["/health", "/health/live", "/health/ready", "/health/ready?full=1"])(
    "matches the probe route %s",
    (url) => {
      expect(isHealthRoute(url)).toBe(true)
    }
  )

  it.each(["/api/v1/health", "/api/v1/health/ready"])(
    "keeps matching once the API moves behind a prefix (%s)",
    (url) => {
      expect(isHealthRoute(url)).toBe(true)
    }
  )

  it.each([
    "/users",
    "/users/health-report",
    "/healthcheck",
    "/health/ready/details",
  ])("does not silence unrelated route %s", (url) => {
    expect(isHealthRoute(url)).toBe(false)
  })

  it("handles a missing url", () => {
    expect(isHealthRoute(undefined)).toBe(false)
    expect(isHealthRoute("")).toBe(false)
  })
})
