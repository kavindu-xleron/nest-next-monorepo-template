import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { ApiOperation, ApiTags } from "@nestjs/swagger"
import { Request } from "express"
import { Webhook } from "svix"
import { Public } from "@core/auth/decorators/public.decorator"
// eslint-disable-next-line no-restricted-imports -- removed in Phase 5 (webhooks)
import { UsersRepository } from "@modules/users/users.repository"
// eslint-disable-next-line no-restricted-imports -- removed in Phase 5 (webhooks)
import { UsersService } from "@modules/users/users.service"

interface RawBodyRequest extends Request {
  rawBody?: Buffer
}

@ApiTags("webhooks")
@Controller("webhooks")
export class ClerkWebhookController {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository
  ) {}

  @Public()
  @Post("clerk")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Handle incoming Clerk webhook user sync events" })
  async handleClerkWebhook(
    @Req() req: RawBodyRequest,
    @Headers("svix-id") svixId: string,
    @Headers("svix-timestamp") svixTimestamp: string,
    @Headers("svix-signature") svixSignature: string
  ): Promise<{ success: boolean }> {
    const webhookSecret = this.configService.get<string>("CLERK_WEBHOOK_SECRET")

    if (!webhookSecret) {
      throw new UnauthorizedException("CLERK_WEBHOOK_SECRET is not configured")
    }

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException("Missing required Svix webhook headers")
    }

    if (!req.rawBody) {
      throw new BadRequestException(
        "Raw request body is missing for Svix verification"
      )
    }

    const payload = req.rawBody.toString("utf8")
    const wh = new Webhook(webhookSecret)
    let evt: any

    try {
      evt = wh.verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      })
    } catch (err) {
      throw new UnauthorizedException(
        `Invalid Svix webhook signature: ${(err as Error).message}`
      )
    }

    const eventType = evt.type
    const data = evt.data

    if (eventType === "user.created" || eventType === "user.updated") {
      const clerkId = data.id
      const primaryEmailObj = data.email_addresses?.find(
        (e: any) => e.id === data.primary_email_address_id
      )
      const email = primaryEmailObj
        ? primaryEmailObj.email_address
        : data.email_addresses?.[0]?.email_address || `${clerkId}@clerk.dev`
      const role = data.public_metadata?.role || "user"
      const firstName = data.first_name || null
      const lastName = data.last_name || null

      await this.usersService.ensureJitUser({
        clerkId,
        email,
        role,
        firstName,
        lastName,
      })
    } else if (eventType === "user.deleted") {
      const clerkId = data.id
      const existing = await this.usersRepository.findByClerkId(clerkId)
      if (existing) {
        await this.usersRepository.softDelete(existing.id)
      }
    }

    return { success: true }
  }
}
