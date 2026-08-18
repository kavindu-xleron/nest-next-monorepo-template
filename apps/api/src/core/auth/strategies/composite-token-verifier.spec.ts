import { UnauthorizedException } from "@nestjs/common"
import { AuthClaims, TokenVerifier } from "../ports/token-verifier"
import { CompositeTokenVerifier } from "./composite-token-verifier"

describe("CompositeTokenVerifier", () => {
  let bearerVerifier: jest.Mocked<TokenVerifier>
  let apiKeyVerifier: jest.Mocked<TokenVerifier>
  let composite: CompositeTokenVerifier

  const mockClaims: AuthClaims = {
    subject: "sub_1",
    email: "test@example.com",
    role: "user",
    firstName: "Test",
    lastName: "User",
  }

  beforeEach(() => {
    bearerVerifier = {
      supports: jest
        .fn()
        .mockImplementation((cred) => cred.scheme === "Bearer"),
      verify: jest.fn().mockResolvedValue(mockClaims),
    } as unknown as jest.Mocked<TokenVerifier>

    apiKeyVerifier = {
      supports: jest
        .fn()
        .mockImplementation((cred) => cred.scheme === "ApiKey"),
      verify: jest.fn().mockResolvedValue({ ...mockClaims, subject: "key_1" }),
    } as unknown as jest.Mocked<TokenVerifier>

    composite = new CompositeTokenVerifier([bearerVerifier, apiKeyVerifier])
  })

  it("should dispatch to matching verifier strategy", async () => {
    const bearerResult = await composite.verify({
      scheme: "Bearer",
      value: "token123",
    })
    expect(bearerResult.subject).toBe("sub_1")
    expect(bearerVerifier.verify).toHaveBeenCalledWith({
      scheme: "Bearer",
      value: "token123",
    })

    const apiResult = await composite.verify({
      scheme: "ApiKey",
      value: "key123",
    })
    expect(apiResult.subject).toBe("key_1")
    expect(apiKeyVerifier.verify).toHaveBeenCalledWith({
      scheme: "ApiKey",
      value: "key123",
    })
  })

  it("should throw UnauthorizedException if no matching strategy supports scheme", async () => {
    await expect(
      composite.verify({ scheme: "Basic", value: "dGVzdDp0ZXN0" })
    ).rejects.toThrow(UnauthorizedException)
  })
})
