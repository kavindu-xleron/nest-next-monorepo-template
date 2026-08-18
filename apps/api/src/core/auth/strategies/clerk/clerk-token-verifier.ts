import { verifyToken } from "@clerk/backend"
import { Injectable, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Credential } from "../../authorization-header"
import { AuthClaims, TokenVerifier } from "../../ports/token-verifier"

@Injectable()
export class ClerkTokenVerifier extends TokenVerifier {
  constructor(private readonly config: ConfigService) {
    super()
  }

  supports(credential: Credential): boolean {
    return credential.scheme === "Bearer"
  }

  async verify({ value }: Credential): Promise<AuthClaims> {
    const secretKey = this.config.get<string>("CLERK_SECRET_KEY")
    if (!secretKey) {
      throw new UnauthorizedException(
        "CLERK_SECRET_KEY authentication service is not configured"
      )
    }

    const partiesRaw = this.config.get<string>("CLERK_AUTHORIZED_PARTIES")
    const authorizedParties = partiesRaw
      ? partiesRaw.split(",").map((s) => s.trim())
      : undefined

    try {
      const verified = await verifyToken(value, {
        secretKey,
        ...(authorizedParties && { authorizedParties }),
      })
      return this.normalize(verified.sub, verified)
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error
      throw new UnauthorizedException(
        `Invalid authentication token: ${(error as Error).message}`
      )
    }
  }
}
