import { verifyToken } from "@clerk/backend"
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Reflector } from "@nestjs/core"
// eslint-disable-next-line no-restricted-imports -- removed in Phase 4 (auth strategy)
import { UsersService } from "@modules/users"
import { IS_PUBLIC_KEY } from "../decorators/public.decorator"

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization
    const token = this.extractTokenFromHeader(authHeader)
    const secretKey = this.configService.get<string>("CLERK_SECRET_KEY")

    if (!token) {
      throw new UnauthorizedException(
        "Missing or malformed Authorization Bearer header"
      )
    }

    if (!secretKey) {
      throw new UnauthorizedException(
        "CLERK_SECRET_KEY authentication service is not configured"
      )
    }

    try {
      const authorizedPartiesRaw = this.configService.get<string>(
        "CLERK_AUTHORIZED_PARTIES"
      )
      const authorizedParties = authorizedPartiesRaw
        ? authorizedPartiesRaw.split(",").map((s) => s.trim())
        : undefined

      const verified = await verifyToken(token, {
        secretKey,
        ...(authorizedParties && { authorizedParties }),
      })
      const clerkId = verified.sub
      const email =
        (verified.email as string) ||
        (verified.email_address as string) ||
        `${clerkId}@clerk.dev`
      const role = (verified.role as string) || "user"
      const firstName = (verified.first_name as string) || null
      const lastName = (verified.last_name as string) || null

      // Just-in-Time (JIT) user provision/sync into local Postgres database
      const user = await this.usersService.ensureJitUser({
        externalId: clerkId,
        email,
        role,
        firstName,
        lastName,
      })

      request.user = user
      return true
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }
      throw new UnauthorizedException(
        `Invalid authentication token: ${(error as Error).message}`
      )
    }
  }

  private extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader) return null
    const [type, token] = authHeader.split(" ")
    return type === "Bearer" && token ? token : null
  }
}
