export interface ClerkWebhookEvent {
  type: string
  data: {
    id: string
    email_addresses?: Array<{ id: string; email_address: string }>
    primary_email_address_id?: string
    public_metadata?: { role?: string }
    first_name?: string | null
    last_name?: string | null
  }
}

export function toJitPayload(data: ClerkWebhookEvent["data"]): {
  externalId: string
  email: string
  role?: string
  firstName?: string | null
  lastName?: string | null
} {
  const externalId = data.id
  const primaryEmailObj = data.email_addresses?.find(
    (e) => e.id === data.primary_email_address_id
  )
  const email = primaryEmailObj
    ? primaryEmailObj.email_address
    : data.email_addresses?.[0]?.email_address || `${externalId}@clerk.dev`
  const role = data.public_metadata?.role || "user"
  const firstName = data.first_name || null
  const lastName = data.last_name || null

  return {
    externalId,
    email,
    role,
    firstName,
    lastName,
  }
}
