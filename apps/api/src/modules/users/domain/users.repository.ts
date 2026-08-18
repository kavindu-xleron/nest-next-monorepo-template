import { Page } from "@shared/types/page"
import { NewUser, User, UserPatch } from "./user.entity"

/**
 * Persistence port for users.
 *
 * Abstract class rather than interface: an interface is erased at compile
 * time and cannot be a Nest DI token, which is what forces the
 * @Inject("USERS_REPOSITORY") string-token style. A class survives.
 *
 * Absence is `null`, never `undefined` — Drizzle returns undefined for a
 * missing row and the previous code let that leak all the way into the
 * service. The port picks one and the adapter converts.
 */
export abstract class UsersRepository {
  abstract findById(id: string): Promise<User | null>
  abstract findByEmail(email: string): Promise<User | null>
  abstract findByExternalId(externalId: string): Promise<User | null>
  abstract findPage(
    cursor: string | undefined,
    limit: number
  ): Promise<Page<User>>
  abstract create(data: NewUser): Promise<User>
  abstract update(id: string, data: UserPatch): Promise<User | null>
  abstract softDelete(id: string): Promise<void>
}
