import { Module } from "@nestjs/common"
// eslint-disable-next-line no-restricted-imports -- removed in Phase 5 (webhooks)
import { UsersModule } from "@modules/users/users.module"
import { ClerkWebhookController } from "./clerk-webhook.controller"

@Module({
  imports: [UsersModule],
  controllers: [ClerkWebhookController],
})
export class WebhooksModule {}
