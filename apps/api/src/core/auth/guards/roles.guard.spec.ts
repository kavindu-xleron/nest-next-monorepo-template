import { ExecutionContext, ForbiddenException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { RolesGuard } from "./roles.guard"

describe("RolesGuard", () => {
  let guard: RolesGuard
  let reflector: jest.Mocked<Reflector>

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>

    guard = new RolesGuard(reflector)
  })

  const createMockContext = (user?: { role: string }): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext
  }

  it("should allow request if no @Roles() metadata is set", () => {
    reflector.getAllAndOverride.mockReturnValue(undefined)
    const context = createMockContext({ role: "user" })

    expect(guard.canActivate(context)).toBe(true)
  })

  it("should allow request if user possesses one of the required roles", () => {
    reflector.getAllAndOverride.mockReturnValue(["admin", "user"])
    const context = createMockContext({ role: "admin" })

    expect(guard.canActivate(context)).toBe(true)
  })

  it("should throw ForbiddenException if user lacks required role", () => {
    reflector.getAllAndOverride.mockReturnValue(["admin"])
    const context = createMockContext({ role: "user" })

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
  })

  it("should throw ForbiddenException if user object or role is missing", () => {
    reflector.getAllAndOverride.mockReturnValue(["admin"])
    const context = createMockContext(undefined)

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
  })
})
