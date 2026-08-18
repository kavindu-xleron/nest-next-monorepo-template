import {
  NewUser as DbNewUser,
  User as UserRow,
} from "@core/database/schema/users"
import { NewUser, User, UserPatch, UserRole } from "../../domain/user.entity"

export function toEntity(row: UserRow): User {
  return {
    id: row.id,
    externalId: row.clerkId,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    avatarUrl: row.avatarUrl,
    role: normalizeRole(row.role),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function toInsert(data: NewUser): DbNewUser {
  return {
    clerkId: data.externalId,
    email: data.email,
    role: data.role ?? "user",
    firstName: data.firstName ?? null,
    lastName: data.lastName ?? null,
    avatarUrl: data.avatarUrl ?? null,
  }
}

export function toPatch(data: UserPatch): Partial<DbNewUser> {
  const result: Partial<DbNewUser> = {}
  if (data.externalId !== undefined) result.clerkId = data.externalId
  if (data.email !== undefined) result.email = data.email
  if (data.role !== undefined) result.role = data.role
  if (data.firstName !== undefined) result.firstName = data.firstName
  if (data.lastName !== undefined) result.lastName = data.lastName
  if (data.avatarUrl !== undefined) result.avatarUrl = data.avatarUrl
  return result
}

/**
 * `role` is varchar(50) in Postgres, so any string can be in there — the
 * previous code papered over this with `user.role as "user" | "admin"` in the
 * service, which REMEDIATION_PLAN.md §3 correctly called a lie (a row with
 * role "superadmin" was actually persisted during that audit).
 *
 * Narrowing happens here instead, at the boundary where the untrusted string
 * enters the application. Anything unrecognised degrades to the least
 * privileged role rather than being asserted into the type system.
 */
export function normalizeRole(role: string): UserRole {
  return role === "admin" ? "admin" : "user"
}
