import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { parseAuthorizationHeader } from "../authorization-header"
import { IS_PUBLIC_KEY } from "../decorators/public.decorator"
import { PrincipalResolver } from "../ports/principal-resolver"
import { TokenVerifier } from "../ports/token-verifier"

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly principals: PrincipalResolver
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest()
    const credential = parseAuthorizationHeader(request.headers.authorization)

    if (!credential) {
      throw new UnauthorizedException(
        "Missing or malformed Authorization header"
      )
    }

    const claims = await this.verifier.verify(credential)
    request.user = await this.principals.resolve(claims)
    return true
  }
}
