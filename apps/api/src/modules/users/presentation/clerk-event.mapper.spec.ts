import { toJitPayload } from "./clerk-event.mapper"

describe("clerk-event.mapper", () => {
  it("should extract primary email when matched by primary_email_address_id", () => {
    const data = {
      id: "clerk_123",
      primary_email_address_id: "email_2",
      email_addresses: [
        { id: "email_1", email_address: "secondary@example.com" },
        { id: "email_2", email_address: "primary@example.com" },
      ],
      public_metadata: { role: "admin" },
      first_name: "John",
      last_name: "Doe",
    }

    const payload = toJitPayload(data)

    expect(payload).toEqual({
      externalId: "clerk_123",
      email: "primary@example.com",
      role: "admin",
      firstName: "John",
      lastName: "Doe",
    })
  })

  it("should fall back to first email if primary_email_address_id does not match", () => {
    const data = {
      id: "clerk_123",
      email_addresses: [{ id: "email_1", email_address: "first@example.com" }],
    }

    const payload = toJitPayload(data)

    expect(payload.email).toBe("first@example.com")
    expect(payload.role).toBe("user")
  })
})
