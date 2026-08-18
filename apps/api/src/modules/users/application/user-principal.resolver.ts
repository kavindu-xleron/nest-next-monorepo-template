import { Injectable, UnauthorizedException } from "@nestjs/common"
import { UserDto } from "@workspace/contracts"
import { PrincipalResolver } from "@core/auth/ports/principal-resolver"
import { AuthClaims } from "@core/auth/ports/token-verifier"
import { UsersService } from "./users.service"

@Injectable()
export class UserPrincipalResolver implements PrincipalResolver {
  constructor(private readonly users: UsersService) {}

  async resolve(claims: AuthClaims): Promise<UserDto> {
    if (!claims.email) {
      throw new UnauthorizedException(
        "Identity provider returned no email address for this subject"
      )
    }

    return this.users.ensureJitUser({
      externalId: claims.subject,
      email: claims.email,
      role: claims.role,
      firstName: claims.firstName,
      lastName: claims.lastName,
    })
  }
}
