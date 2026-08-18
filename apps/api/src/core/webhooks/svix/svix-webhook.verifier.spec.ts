import { BadRequestException, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Webhook } from "svix"
import { SvixWebhookVerifier } from "./svix-webhook.verifier"

describe("SvixWebhookVerifier", () => {
  let verifier: SvixWebhookVerifier
  let configService: jest.Mocked<ConfigService>
  const testSecret = "whsec_C2832520A9C3C7A87A5B9F4B1842C4B1"

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "CLERK_WEBHOOK_SECRET") return testSecret
        return undefined
      }),
    } as unknown as jest.Mocked<ConfigService>

    verifier = new SvixWebhookVerifier(configService)
  })

  it("should throw UnauthorizedException if secret is missing", () => {
    configService.get.mockReturnValue(undefined)

    expect(() =>
      verifier.verify(Buffer.from("{}"), {
        "svix-id": "msg_1",
        "svix-timestamp": "123456",
        "svix-signature": "v1,sig",
      })
    ).toThrow(UnauthorizedException)
  })

  it("should throw BadRequestException if required svix headers are missing", () => {
    expect(() =>
      verifier.verify(Buffer.from("{}"), {
        "svix-id": "msg_1",
      })
    ).toThrow(BadRequestException)
  })

  it("should throw BadRequestException if rawBody is missing", () => {
    expect(() =>
      verifier.verify(undefined, {
        "svix-id": "msg_1",
        "svix-timestamp": "123456",
        "svix-signature": "v1,sig",
      })
    ).toThrow(BadRequestException)
  })

  it("should verify valid signature using svix and return parsed payload", () => {
    const payload = JSON.stringify({
      type: "user.created",
      data: { id: "clerk_1" },
    })
    const rawBody = Buffer.from(payload)
    const wh = new Webhook(testSecret)
    const timestamp = new Date()
    const msgId = "msg_test_123"
    const signature = wh.sign(msgId, timestamp, payload)

    const headers = {
      "svix-id": msgId,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": signature,
    }

    const result = verifier.verify<{ type: string; data: { id: string } }>(
      rawBody,
      headers
    )

    expect(result).toEqual({ type: "user.created", data: { id: "clerk_1" } })
  })
})
