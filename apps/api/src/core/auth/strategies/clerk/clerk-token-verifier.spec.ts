import { UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { ClerkTokenVerifier } from "./clerk-token-verifier"

jest.mock("@clerk/backend", () => ({
  verifyToken: jest.fn().mockImplementation((token: string) => {
    if (token === "invalid-token") {
      throw new Error("Invalid token format")
    }
    return Promise.resolve({
      sub: "clerk_123",
      email: "clerk@example.com",
      role: "admin",
      first_name: "Clerk",
      last_name: "User",
    })
  }),
}))

describe("ClerkTokenVerifier", () => {
  let verifier: ClerkTokenVerifier
  let configService: jest.Mocked<ConfigService>

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "CLERK_SECRET_KEY") return "sk_test_123"
        if (key === "CLERK_AUTHORIZED_PARTIES")
          return "http://localhost:3000, https://app.example.com"
        return undefined
      }),
    } as unknown as jest.Mocked<ConfigService>

    verifier = new ClerkTokenVerifier(configService)
  })

  it("should support Bearer scheme", () => {
    expect(verifier.supports({ scheme: "Bearer", value: "token" })).toBe(true)
    expect(verifier.supports({ scheme: "ApiKey", value: "token" })).toBe(false)
  })

  it("should throw UnauthorizedException if CLERK_SECRET_KEY is missing", async () => {
    configService.get.mockReturnValue(undefined)

    await expect(
      verifier.verify({ scheme: "Bearer", value: "valid-token" })
    ).rejects.toThrow(UnauthorizedException)
  })

  it("should verify valid token and return normalized claims", async () => {
    const claims = await verifier.verify({
      scheme: "Bearer",
      value: "valid-token",
    })

    expect(claims).toEqual({
      subject: "clerk_123",
      email: "clerk@example.com",
      role: "admin",
      firstName: "Clerk",
      lastName: "User",
    })
  })

  it("should throw UnauthorizedException on invalid token verification failure", async () => {
    await expect(
      verifier.verify({ scheme: "Bearer", value: "invalid-token" })
    ).rejects.toThrow(UnauthorizedException)
  })
})
