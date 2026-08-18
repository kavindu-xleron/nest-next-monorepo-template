import { Inject, Injectable } from "@nestjs/common"
import { and, desc, eq, isNull, lt } from "drizzle-orm"
import { DRIZZLE, DrizzleDB } from "@core/database/database.module"
import { users } from "@core/database/schema/users"
import { Page } from "@shared/types/page"
import { NewUser, User, UserPatch } from "../../domain/user.entity"
import { UsersRepository } from "../../domain/users.repository"
import { toEntity, toInsert, toPatch } from "./user.mapper"

@Injectable()
export class DrizzleUsersRepository implements UsersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1)

    return rows[0] ? toEntity(rows[0]) : null
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1)

    return rows[0] ? toEntity(rows[0]) : null
  }

  async findByExternalId(externalId: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.clerkId, externalId), isNull(users.deletedAt)))
      .limit(1)

    return rows[0] ? toEntity(rows[0]) : null
  }

  async findPage(cursor: string | undefined, limit = 20): Promise<Page<User>> {
    const conditions = [isNull(users.deletedAt)]

    if (cursor) {
      conditions.push(lt(users.id, cursor))
    }

    const fetchedRows = await this.db
      .select()
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.id))
      .limit(limit + 1)

    const hasMore = fetchedRows.length > limit
    const items = hasMore ? fetchedRows.slice(0, limit) : fetchedRows
    const lastItem = items[items.length - 1]
    const nextCursor = hasMore && lastItem ? lastItem.id : null

    return {
      items: items.map(toEntity),
      nextCursor,
      hasMore,
    }
  }

  async create(data: NewUser): Promise<User> {
    const dbInsert = toInsert(data)
    const rows = await this.db.insert(users).values(dbInsert).returning()
    const created = rows[0]
    if (!created) {
      throw new Error("Failed to insert user row into database")
    }
    return toEntity(created)
  }

  async update(id: string, data: UserPatch): Promise<User | null> {
    const dbPatch = toPatch(data)
    const rows = await this.db
      .update(users)
      .set({ ...dbPatch, updatedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning()

    return rows[0] ? toEntity(rows[0]) : null
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
  }
}
