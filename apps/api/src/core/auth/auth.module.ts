import { Module } from "@nestjs/common"
// eslint-disable-next-line no-restricted-imports -- removed in Phase 4 (auth strategy)
import { UsersModule } from "@modules/users/users.module"
import { ClerkAuthGuard } from "./guards/clerk-auth.guard"
import { RolesGuard } from "./guards/roles.guard"

@Module({
  imports: [UsersModule],
  providers: [ClerkAuthGuard, RolesGuard],
  exports: [ClerkAuthGuard, RolesGuard],
})
export class AuthModule {}
