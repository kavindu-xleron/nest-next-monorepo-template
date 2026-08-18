import { Injectable, UnauthorizedException } from "@nestjs/common"
import { Credential } from "../authorization-header"
import { AuthClaims, TokenVerifier } from "../ports/token-verifier"

@Injectable()
export class CompositeTokenVerifier extends TokenVerifier {
  constructor(private readonly verifiers: TokenVerifier[]) {
    super()
  }

  supports(): boolean {
    return true
  }

  async verify(credential: Credential): Promise<AuthClaims> {
    const match = this.verifiers.find((v) => v.supports(credential))
    if (!match) {
      throw new UnauthorizedException(
        `Unsupported authorization scheme '${credential.scheme}'`
      )
    }
    return match.verify(credential)
  }
}
