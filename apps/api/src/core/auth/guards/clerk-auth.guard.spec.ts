import { ExecutionContext, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Reflector } from "@nestjs/core"
import { UsersService } from "../../users/users.service"
import { ClerkAuthGuard } from "./clerk-auth.guard"

describe("ClerkAuthGuard", () => {
  let guard: ClerkAuthGuard
  let reflector: jest.Mocked<Reflector>
  let configService: jest.Mocked<ConfigService>
  let usersService: jest.Mocked<UsersService>

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "NODE_ENV") return "test"
        return undefined
      }),
    } as unknown as jest.Mocked<ConfigService>

    usersService = {
      findMe: jest.fn().mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        role: "user",
      }),
      ensureJitUser: jest.fn(),
    } as unknown as jest.Mocked<UsersService>

    guard = new ClerkAuthGuard(reflector, configService, usersService)
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
  })

  it("should throw UnauthorizedException in production if Bearer token is missing", async () => {
    reflector.getAllAndOverride.mockReturnValue(false)
    configService.get.mockImplementation((key: string) => {
      if (key === "NODE_ENV") return "production"
      if (key === "CLERK_SECRET_KEY") return "sk_test_123"
      return undefined
    })

    const prodGuard = new ClerkAuthGuard(reflector, configService, usersService)
    const { context } = createMockContext({})

    await expect(prodGuard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    )
  })
})
