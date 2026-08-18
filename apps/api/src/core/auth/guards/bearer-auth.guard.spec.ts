import { ExecutionContext, UnauthorizedException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { PrincipalResolver } from "../ports/principal-resolver"
import { AuthClaims, TokenVerifier } from "../ports/token-verifier"
import { BearerAuthGuard } from "./bearer-auth.guard"

describe("BearerAuthGuard", () => {
  let guard: BearerAuthGuard
  let reflector: jest.Mocked<Reflector>
  let verifier: jest.Mocked<TokenVerifier>
  let principals: jest.Mocked<PrincipalResolver>

  const mockClaims: AuthClaims = {
    subject: "user-123",
    email: "test@example.com",
    role: "user",
    firstName: "Test",
    lastName: "User",
  }

  const mockPrincipal = {
    id: "user-123",
    email: "test@example.com",
    role: "user",
  }

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>

    verifier = {
      supports: jest.fn().mockReturnValue(true),
      verify: jest.fn().mockResolvedValue(mockClaims),
    } as unknown as jest.Mocked<TokenVerifier>

    principals = {
      resolve: jest.fn().mockResolvedValue(mockPrincipal),
    } as unknown as jest.Mocked<PrincipalResolver>

    guard = new BearerAuthGuard(reflector, verifier, principals)
  })

  const createMockContext = (headers: Record<string, string> = {}) => {
    const request: Record<string, any> = { headers }
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext

    return { context, request }
  }

  it("should allow request if route is decorated with @Public()", async () => {
    reflector.getAllAndOverride.mockReturnValue(true)
    const { context } = createMockContext()

    const result = await guard.canActivate(context)
    expect(result).toBe(true)
    expect(verifier.verify).not.toHaveBeenCalled()
  })

  it("should throw UnauthorizedException if Authorization header is missing", async () => {
    reflector.getAllAndOverride.mockReturnValue(false)
    const { context } = createMockContext({})

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    )
  })

  it("should throw UnauthorizedException if Authorization header format is invalid", async () => {
    reflector.getAllAndOverride.mockReturnValue(false)
    const { context } = createMockContext({
      authorization: "InvalidTokenFormat",
    })

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    )
  })

  it("should verify credential, resolve principal, and attach user to request", async () => {
    reflector.getAllAndOverride.mockReturnValue(false)
    const { context, request } = createMockContext({
      authorization: "Bearer valid-token-123",
    })

    const result = await guard.canActivate(context)

    expect(result).toBe(true)
    expect(verifier.verify).toHaveBeenCalledWith({
      scheme: "Bearer",
      value: "valid-token-123",
    })
    expect(principals.resolve).toHaveBeenCalledWith(mockClaims)
    expect(request.user).toEqual(mockPrincipal)
  })
})
