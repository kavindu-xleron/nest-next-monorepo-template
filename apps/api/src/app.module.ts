import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { CoreModule } from "@core/core.module"
import { AuthModule } from "@core/auth/auth.module"
import { ClerkAuthGuard } from "@core/auth/guards/clerk-auth.guard"
import { RolesGuard } from "@core/auth/guards/roles.guard"
import { WebhooksModule } from "@core/webhooks/webhooks.module"
import { UsersModule } from "@modules/users/users.module"
import { AppController } from "./app.controller"
import { AppService } from "./app.service"

@Module({
  imports: [CoreModule, AuthModule, UsersModule, WebhooksModule],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
