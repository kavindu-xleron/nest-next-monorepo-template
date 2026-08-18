import { WebhookVerifier } from "@core/webhooks/ports/webhook-verifier"
import { UsersService } from "../application/users.service"
import { ClerkUserSyncController } from "./clerk-user-sync.controller"

describe("ClerkUserSyncController", () => {
  let controller: ClerkUserSyncController
  let verifier: jest.Mocked<WebhookVerifier>
  let usersService: jest.Mocked<UsersService>

  beforeEach(() => {
    verifier = {
      verify: jest.fn(),
    } as unknown as jest.Mocked<WebhookVerifier>

    usersService = {
      ensureJitUser: jest.fn().mockResolvedValue({ id: "user-1" }),
      removeByExternalId: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UsersService>

    controller = new ClerkUserSyncController(verifier, usersService)
  })

  it("should process user.created event and trigger ensureJitUser", async () => {
    const payload = {
      type: "user.created",
      data: {
        id: "clerk_123",
        primary_email_address_id: "email_1",
        email_addresses: [
          { id: "email_1", email_address: "webhook@example.com" },
        ],
        first_name: "Clerk",
        last_name: "User",
      },
    }

    verifier.verify.mockReturnValue(payload)

    const mockReq = {
      headers: { "svix-id": "msg_1" },
      rawBody: Buffer.from(JSON.stringify(payload)),
    } as any

    const result = await controller.handle(mockReq)

    expect(result).toEqual({ success: true })
    expect(usersService.ensureJitUser).toHaveBeenCalledWith({
      externalId: "clerk_123",
      email: "webhook@example.com",
      role: "user",
      firstName: "Clerk",
      lastName: "User",
    })
  })

  it("should process user.deleted event and call removeByExternalId", async () => {
    const payload = {
      type: "user.deleted",
      data: { id: "clerk_123" },
    }

    verifier.verify.mockReturnValue(payload)

    const mockReq = {
      headers: { "svix-id": "msg_2" },
      rawBody: Buffer.from(JSON.stringify(payload)),
    } as any

    const result = await controller.handle(mockReq)

    expect(result).toEqual({ success: true })
    expect(usersService.removeByExternalId).toHaveBeenCalledWith("clerk_123")
  })
})
