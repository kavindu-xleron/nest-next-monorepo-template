import { ConfigService } from "@nestjs/config"
// eslint-disable-next-line no-restricted-imports -- removed in Phase 5 (webhooks)
import { UsersRepository } from "@modules/users/domain/users.repository"
// eslint-disable-next-line no-restricted-imports -- removed in Phase 5 (webhooks)
import { UsersService } from "@modules/users"
import { ClerkWebhookController } from "./clerk-webhook.controller"

jest.mock("svix", () => {
  return {
    Webhook: jest.fn().mockImplementation(() => ({
      verify: jest
        .fn()
        .mockImplementation((payload: string) => JSON.parse(payload)),
    })),
  }
})

describe("ClerkWebhookController", () => {
  let controller: ClerkWebhookController
  let configService: jest.Mocked<ConfigService>
  let usersService: jest.Mocked<UsersService>
  let usersRepository: jest.Mocked<UsersRepository>

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "NODE_ENV") return "test"
        if (key === "CLERK_WEBHOOK_SECRET") return "whsec_test123"
        return undefined
      }),
    } as unknown as jest.Mocked<ConfigService>

    usersService = {
      ensureJitUser: jest.fn().mockResolvedValue({ id: "user-1" }),
    } as unknown as jest.Mocked<UsersService>

    usersRepository = {
      findByExternalId: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>

    controller = new ClerkWebhookController(
      configService,
      usersService,
      usersRepository
    )
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

    const mockReq = {
      body: payload,
      rawBody: Buffer.from(JSON.stringify(payload)),
    } as any

    const result = await controller.handleClerkWebhook(
      mockReq,
      "svix_id",
      "svix_ts",
      "svix_sig"
    )

    expect(result).toEqual({ success: true })
    expect(usersService.ensureJitUser).toHaveBeenCalledWith({
      clerkId: "clerk_123",
      email: "webhook@example.com",
      role: "user",
      firstName: "Clerk",
      lastName: "User",
    })
  })

  it("should process user.deleted event and soft delete user record", async () => {
    usersRepository.findByExternalId.mockResolvedValue({
      id: "user-1",
    } as any)

    const payload = {
      type: "user.deleted",
      data: {
        id: "clerk_123",
      },
    }

    const mockReq = {
      body: payload,
      rawBody: Buffer.from(JSON.stringify(payload)),
    } as any

    const result = await controller.handleClerkWebhook(
      mockReq,
      "svix_id",
      "svix_ts",
      "svix_sig"
    )

    expect(result).toEqual({ success: true })
    expect(usersRepository.softDelete).toHaveBeenCalledWith("user-1")
  })
})
