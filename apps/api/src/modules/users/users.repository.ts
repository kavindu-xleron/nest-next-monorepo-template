import { Inject, Injectable } from "@nestjs/common"
import { and, desc, eq, isNull, lt } from "drizzle-orm"
import { DRIZZLE, DrizzleDB } from "@core/database/database.module"
import { NewUser, User, users } from "@core/database/schema/users"

@Injectable()
export class UsersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findById(id: string): Promise<User | undefined> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1)

    return rows[0]
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1)

    return rows[0]
  }

  async findByClerkId(clerkId: string): Promise<User | undefined> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.clerkId, clerkId), isNull(users.deletedAt)))
      .limit(1)

    return rows[0]
  }

  async findPaginated(
    cursor?: string,
    limit = 20
  ): Promise<{ items: User[]; nextCursor: string | null; hasMore: boolean }> {
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
      items,
      nextCursor,
      hasMore,
    }
  }

  async create(data: NewUser): Promise<User> {
    const rows = await this.db.insert(users).values(data).returning()
    const created = rows[0]
    if (!created) {
      throw new Error("Failed to insert user row into database")
    }
    return created
  }

  async update(id: string, data: Partial<NewUser>): Promise<User | undefined> {
    const rows = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning()

    return rows[0]
  }

  async softDelete(id: string): Promise<User | undefined> {
    const rows = await this.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning()

    return rows[0]
  }
}
