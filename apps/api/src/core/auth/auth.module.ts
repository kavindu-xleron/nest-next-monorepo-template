import { Module } from "@nestjs/common"
import { UsersModule } from "../users/users.module"
import { ClerkAuthGuard } from "./guards/clerk-auth.guard"
import { RolesGuard } from "./guards/roles.guard"

@Module({
  imports: [UsersModule],
  providers: [ClerkAuthGuard, RolesGuard],
  exports: [ClerkAuthGuard, RolesGuard],
})
export class AuthModule {}
