import { Module } from "@nestjs/common"
import { UsersModule } from "../users/users.module"
import { ClerkWebhookController } from "./clerk-webhook.controller"

@Module({
  imports: [UsersModule],
  controllers: [ClerkWebhookController],
})
export class WebhooksModule {}
