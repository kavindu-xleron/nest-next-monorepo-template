export interface Credential {
  scheme: string
  value: string
}

export function parseAuthorizationHeader(
  authHeader?: string
): Credential | null {
  if (!authHeader) return null
  const parts = authHeader.trim().split(" ")
  if (parts.length !== 2) return null
  const [scheme, value] = parts
  if (!scheme || !value) return null
  return { scheme, value }
}
