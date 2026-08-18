import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Webhook } from "svix"
import { WebhookVerifier } from "../ports/webhook-verifier"

function single(val: string | string[] | undefined): string | undefined {
  if (!val) return undefined
  return Array.isArray(val) ? val[0] : val
}

@Injectable()
export class SvixWebhookVerifier extends WebhookVerifier {
  constructor(private readonly config: ConfigService) {
    super()
  }

  verify<T>(
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>
  ): T {
    const secret = this.config.get<string>("CLERK_WEBHOOK_SECRET")
    if (!secret) {
      throw new UnauthorizedException("CLERK_WEBHOOK_SECRET is not configured")
    }

    const id = single(headers["svix-id"])
    const timestamp = single(headers["svix-timestamp"])
    const signature = single(headers["svix-signature"])

    if (!id || !timestamp || !signature) {
      throw new BadRequestException("Missing required Svix webhook headers")
    }
    if (!rawBody) {
      throw new BadRequestException(
        "Raw request body is missing for Svix verification"
      )
    }

    try {
      return new Webhook(secret).verify(rawBody.toString("utf8"), {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
      }) as T
    } catch (err) {
      throw new UnauthorizedException(
        `Invalid Svix webhook signature: ${(err as Error).message}`
      )
    }
  }
}
