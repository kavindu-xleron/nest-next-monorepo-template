import { UnauthorizedException } from "@nestjs/common"
import { AuthClaims } from "@core/auth/ports/token-verifier"
import { UsersService } from "./users.service"
import { UserPrincipalResolver } from "./user-principal.resolver"

describe("UserPrincipalResolver", () => {
  let resolver: UserPrincipalResolver
  let usersService: jest.Mocked<UsersService>

  const mockUserDto = {
    id: "user-1",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    avatarUrl: null,
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    usersService = {
      ensureJitUser: jest.fn().mockResolvedValue(mockUserDto),
    } as unknown as jest.Mocked<UsersService>

    resolver = new UserPrincipalResolver(usersService)
  })

  it("should throw UnauthorizedException if identity provider claims contain no email", async () => {
    const claims: AuthClaims = {
      subject: "sub_123",
      email: null,
      role: "user",
      firstName: "Test",
      lastName: "User",
    }

    await expect(resolver.resolve(claims)).rejects.toThrow(
      UnauthorizedException
    )
  })

  it("should delegate to usersService.ensureJitUser when email is present", async () => {
    const claims: AuthClaims = {
      subject: "sub_123",
      email: "test@example.com",
      role: "user",
      firstName: "Test",
      lastName: "User",
    }

    const result = await resolver.resolve(claims)

    expect(result).toEqual(mockUserDto)
    expect(usersService.ensureJitUser).toHaveBeenCalledWith({
      externalId: "sub_123",
      email: "test@example.com",
      role: "user",
      firstName: "Test",
      lastName: "User",
    })
  })
})
