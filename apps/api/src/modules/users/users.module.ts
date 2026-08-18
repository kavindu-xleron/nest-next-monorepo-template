import { Module } from "@nestjs/common"
import { UsersService } from "./application/users.service"
import { UsersRepository } from "./domain/users.repository"
import { DrizzleUsersRepository } from "./infrastructure/drizzle/drizzle-users.repository"
import { ClerkUserSyncController } from "./presentation/clerk-user-sync.controller"
import { UsersController } from "./presentation/users.controller"

@Module({
  controllers: [UsersController, ClerkUserSyncController],
  providers: [
    UsersService,
    { provide: UsersRepository, useClass: DrizzleUsersRepository },
  ],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
