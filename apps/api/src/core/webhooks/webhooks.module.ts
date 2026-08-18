import { Global, Module } from "@nestjs/common"
import { WebhookVerifier } from "./ports/webhook-verifier"
import { SvixWebhookVerifier } from "./svix/svix-webhook.verifier"

@Global()
@Module({
  providers: [{ provide: WebhookVerifier, useClass: SvixWebhookVerifier }],
  exports: [WebhookVerifier],
})
export class WebhooksModule {}
