import { Module } from "@nestjs/common"
import { CoreModule } from "@core/core.module"
import { AuthModule } from "@core/auth/auth.module"
import { PrincipalResolver } from "@core/auth/ports/principal-resolver"
import { TokenVerifier } from "@core/auth/ports/token-verifier"
import { ClerkTokenVerifier } from "@core/auth/strategies/clerk/clerk-token-verifier"
import { UserPrincipalResolver, UsersModule } from "@modules/users"
import { AppController } from "./app.controller"
import { AppService } from "./app.service"

@Module({
  imports: [
    CoreModule,
    UsersModule,
    AuthModule.register({
      imports: [UsersModule],
      verifier: { provide: TokenVerifier, useClass: ClerkTokenVerifier },
      resolver: { provide: PrincipalResolver, useClass: UserPrincipalResolver },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
