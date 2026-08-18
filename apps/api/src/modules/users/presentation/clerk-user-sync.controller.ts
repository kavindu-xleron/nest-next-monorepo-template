import { Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"
import { Request } from "express"
import { Public } from "@core/auth/decorators/public.decorator"
import { WebhookVerifier } from "@core/webhooks/ports/webhook-verifier"
import { UsersService } from "../application/users.service"
import { ClerkWebhookEvent, toJitPayload } from "./clerk-event.mapper"

interface RawBodyRequest extends Request {
  rawBody?: Buffer
}

@ApiTags("webhooks")
@Controller("webhooks")
export class ClerkUserSyncController {
  constructor(
    private readonly verifier: WebhookVerifier,
    private readonly users: UsersService
  ) {}

  @Public()
  @Post("clerk")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Handle incoming Clerk webhook user sync events" })
  async handle(@Req() req: RawBodyRequest): Promise<{ success: boolean }> {
    const event = this.verifier.verify<ClerkWebhookEvent>(
      req.rawBody,
      req.headers
    )

    switch (event.type) {
      case "user.created":
      case "user.updated":
        await this.users.ensureJitUser(toJitPayload(event.data))
        break
      case "user.deleted":
        await this.users.removeByExternalId(event.data.id)
        break
    }

    return { success: true }
  }
}
