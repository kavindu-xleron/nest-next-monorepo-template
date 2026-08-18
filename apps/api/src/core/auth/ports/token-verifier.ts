import { Credential } from "../authorization-header"

/** Provider-neutral claim set. Whatever the IdP calls these, they arrive here. */
export interface AuthClaims {
  subject: string
  email: string | null
  role: string
  firstName: string | null
  lastName: string | null
}

export abstract class TokenVerifier {
  /** Can this strategy handle the credential? Lets several coexist. */
  abstract supports(credential: Credential): boolean

  /** Throws UnauthorizedException on anything invalid. Never returns null. */
  abstract verify(credential: Credential): Promise<AuthClaims>

  /**
   * Shared claim normalization for JWT-shaped providers. Concrete behaviour,
   * which is why adapters `extends` this rather than `implements` it.
   */
  protected normalize(
    subject: string,
    payload: Record<string, unknown>
  ): AuthClaims {
    return {
      subject,
      email:
        (payload.email as string) ?? (payload.email_address as string) ?? null,
      role: (payload.role as string) ?? "user",
      firstName: (payload.first_name as string) ?? null,
      lastName: (payload.last_name as string) ?? null,
    }
  }
}
