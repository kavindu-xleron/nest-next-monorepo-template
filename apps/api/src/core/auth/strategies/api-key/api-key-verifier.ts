import { Injectable, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Credential } from "../../authorization-header"
import { AuthClaims, TokenVerifier } from "../../ports/token-verifier"

@Injectable()
export class ApiKeyTokenVerifier extends TokenVerifier {
  constructor(private readonly config: ConfigService) {
    super()
  }

  supports(credential: Credential): boolean {
    return credential.scheme === "ApiKey"
  }

  async verify({ value }: Credential): Promise<AuthClaims> {
    const validKeysRaw = this.config.get<string>("API_KEYS", "")
    const validKeys = validKeysRaw
      ? validKeysRaw.split(",").map((k) => k.trim())
      : []

    if (!validKeys.includes(value)) {
      throw new UnauthorizedException("Invalid API key")
    }

    return {
      subject: `api_key_${value.slice(0, 8)}`,
      email: null,
      role: "user",
      firstName: "API Key",
      lastName: "User",
    }
  }
}
