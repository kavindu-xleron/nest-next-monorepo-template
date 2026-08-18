export type UserRole = "user" | "admin"

/**
 * A user as the business understands one.
 *
 * `externalId` is the identity-provider subject. It is deliberately not
 * called clerkId: the column is still `clerk_id` (renaming it is a migration
 * we do not need), and the mapper in infrastructure/drizzle is the only place
 * that knows the two are the same thing.
 *
 * There is no `deletedAt` here. Soft deletion is a persistence strategy; the
 * domain's position is that a deleted user is simply not returned.
 */
export interface User {
  id: string
  externalId: string
  email: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  role: UserRole
  createdAt: Date
  updatedAt: Date
}

export interface NewUser {
  externalId: string
  email: string
  role?: UserRole
  firstName?: string | null
  lastName?: string | null
  avatarUrl?: string | null
}

export type UserPatch = Partial<NewUser>
