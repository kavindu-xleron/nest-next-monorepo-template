import { validateEnv } from "./env.schema"

describe("validateEnv", () => {
  describe("defaults and coercion", () => {
    it("parses default environment values", () => {
      const env = validateEnv({})
      expect(env.NODE_ENV).toBe("development")
      expect(env.PORT).toBe(5001)
      expect(env.LOG_LEVEL).toBe("info")
      expect(env.DRAIN_INTERVAL_MS).toBe(5000)
      expect(env.SHUTDOWN_TIMEOUT_MS).toBe(30_000)
    })

    it("coerces numeric strings, since every env var arrives as a string", () => {
      const env = validateEnv({ PORT: "8080", DRAIN_INTERVAL_MS: "1500" })
      expect(env.PORT).toBe(8080)
      expect(env.DRAIN_INTERVAL_MS).toBe(1500)
    })

    it("strips variables it does not declare", () => {
      // ConfigService is fed whatever this returns, so an undeclared var is
      // invisible downstream however faithfully it was set.
      const env = validateEnv({ SOME_UNDECLARED_VAR: "value" })
      expect(env).not.toHaveProperty("SOME_UNDECLARED_VAR")
    })
  })

  describe("rejects values that would break at runtime", () => {
    it.each([
      ["NODE_ENV", { NODE_ENV: "invalid_env" }],
      ["LOG_LEVEL", { LOG_LEVEL: "super_verbose" }],
      ["a non-numeric PORT", { PORT: "not-a-port" }],
      ["an out-of-range PORT", { PORT: "70000" }],
      ["a malformed DATABASE_URL", { DATABASE_URL: "not-a-url" }],
    ])("rejects %s", (_label, config) => {
      expect(() => validateEnv(config)).toThrow(/Invalid environment variables/)
    })

    it("rejects an empty PORT rather than silently binding port 0", () => {
      // "PORT=" in a .env file coerces to 0, which would bind a random port.
      expect(() => validateEnv({ PORT: "" })).toThrow(
        /Invalid environment variables/
      )
    })
  })

  describe("cross-field invariants", () => {
    it("rejects a drain interval that outlasts the shutdown deadline", () => {
      // Otherwise the force-exit fires mid-drain and every shutdown is a hard
      // kill that cuts off in-flight requests.
      expect(() =>
        validateEnv({
          DRAIN_INTERVAL_MS: "40000",
          SHUTDOWN_TIMEOUT_MS: "30000",
        })
      ).toThrow(/must be less than SHUTDOWN_TIMEOUT_MS/)
    })

    it("accepts a drain interval inside the deadline", () => {
      const env = validateEnv({
        DRAIN_INTERVAL_MS: "5000",
        SHUTDOWN_TIMEOUT_MS: "30000",
      })
      expect(env.DRAIN_INTERVAL_MS).toBeLessThan(env.SHUTDOWN_TIMEOUT_MS)
    })
  })

  describe("production requirements", () => {
    const productionEnv = {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://user:pass@localhost:5432/app",
      CLERK_SECRET_KEY: "sk_live_123",
      CLERK_WEBHOOK_SECRET: "whsec_123",
    }

    it("requires DATABASE_URL in production", () => {
      expect(() => validateEnv({ NODE_ENV: "production" })).toThrow(
        /DATABASE_URL/
      )
    })

    it("allows DATABASE_URL to be absent outside production", () => {
      expect(() => validateEnv({ NODE_ENV: "development" })).not.toThrow()
      expect(() => validateEnv({ NODE_ENV: "test" })).not.toThrow()
    })

    it("accepts a fully configured production environment", () => {
      const env = validateEnv(productionEnv)
      expect(env.NODE_ENV).toBe("production")
      expect(env.DATABASE_URL).toBe(productionEnv.DATABASE_URL)
    })
  })
})
