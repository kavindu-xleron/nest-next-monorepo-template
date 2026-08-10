import { validateEnv } from "./env.schema"

describe("validateEnv", () => {
  it("should parse default environment values", () => {
    const env = validateEnv({})
    expect(env.NODE_ENV).toBe("development")
    expect(env.PORT).toBe(5001)
    expect(env.LOG_LEVEL).toBe("info")
  })

  it("should coerce PORT string to number", () => {
    const env = validateEnv({ PORT: "8080" })
    expect(env.PORT).toBe(8080)
  })

  it("should throw error if NODE_ENV is invalid", () => {
    expect(() => validateEnv({ NODE_ENV: "invalid_env" })).toThrow(
      /Invalid environment variables/
    )
  })

  it("should throw error if LOG_LEVEL is invalid", () => {
    expect(() => validateEnv({ LOG_LEVEL: "super_verbose" })).toThrow(
      /Invalid environment variables/
    )
  })
})
