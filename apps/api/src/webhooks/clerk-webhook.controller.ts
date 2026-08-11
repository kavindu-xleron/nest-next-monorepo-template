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
import { Public } from "../auth/decorators/public.decorator"
import { UsersRepository } from "../users/users.repository"
import { UsersService } from "../users/users.service"

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

    // In dev/test without secret, allow testing webhook payload parsing
    if (!webhookSecret) {
      const nodeEnv = this.configService.get<string>("NODE_ENV")
      if (nodeEnv === "production") {
        throw new UnauthorizedException(
          "CLERK_WEBHOOK_SECRET is not configured"
        )
      }
    }

    if (webhookSecret && (!svixId || !svixTimestamp || !svixSignature)) {
      throw new BadRequestException("Missing required Svix webhook headers")
    }

    const payload = req.rawBody
      ? req.rawBody.toString("utf8")
      : JSON.stringify(req.body)

    let evt: any = req.body

    if (webhookSecret) {
      const wh = new Webhook(webhookSecret)
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
