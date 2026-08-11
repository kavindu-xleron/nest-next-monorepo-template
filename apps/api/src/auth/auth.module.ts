import { Module } from "@nestjs/common"
import { UsersModule } from "../users/users.module"
import { CaslAbilityFactory } from "./casl/casl-ability.factory"
import { ClerkAuthGuard } from "./guards/clerk-auth.guard"
import { RolesGuard } from "./guards/roles.guard"

@Module({
  imports: [UsersModule],
  providers: [ClerkAuthGuard, RolesGuard, CaslAbilityFactory],
  exports: [ClerkAuthGuard, RolesGuard, CaslAbilityFactory],
})
export class AuthModule {}
