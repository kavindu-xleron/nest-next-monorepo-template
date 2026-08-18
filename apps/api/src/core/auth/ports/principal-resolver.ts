import { AuthClaims } from "./token-verifier"

/** The minimum core needs to know about an authenticated caller. */
export interface Principal {
  id: string
  email: string
  role: string
}

export abstract class PrincipalResolver {
  abstract resolve(claims: AuthClaims): Promise<Principal>
}
