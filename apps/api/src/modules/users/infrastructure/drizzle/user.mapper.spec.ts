import { User as UserRow } from "@core/database/schema/users"
import { NewUser } from "../../domain/user.entity"
import { normalizeRole, toEntity, toInsert, toPatch } from "./user.mapper"

describe("user.mapper", () => {
  describe("toEntity", () => {
    it("should map row to entity correctly including clerkId -> externalId", () => {
      const now = new Date()
      const row: UserRow = {
        id: "user-1",
        clerkId: "clerk_123",
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
        avatarUrl: null,
        role: "admin",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      const entity = toEntity(row)

      expect(entity).toEqual({
        id: "user-1",
        externalId: "clerk_123",
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
        avatarUrl: null,
        role: "admin",
        createdAt: now,
        updatedAt: now,
      })
    })
  })

  describe("toInsert", () => {
    it("should map NewUser domain entity to DbNewUser", () => {
      const input: NewUser = {
        externalId: "clerk_456",
        email: "new@example.com",
        role: "user",
        firstName: "John",
      }

      const dbInsert = toInsert(input)

      expect(dbInsert).toEqual({
        clerkId: "clerk_456",
        email: "new@example.com",
        role: "user",
        firstName: "John",
        lastName: null,
        avatarUrl: null,
      })
    })
  })

  describe("toPatch", () => {
    it("should map present keys to DbNewUser partial", () => {
      const patch = toPatch({ externalId: "clerk_789", firstName: "Jane" })
      expect(patch).toEqual({ clerkId: "clerk_789", firstName: "Jane" })
    })
  })

  describe("normalizeRole", () => {
    it("should return 'admin' for 'admin' and 'user' for unrecognized roles", () => {
      expect(normalizeRole("admin")).toBe("admin")
      expect(normalizeRole("superadmin")).toBe("user")
      expect(normalizeRole("ADMIN")).toBe("user")
      expect(normalizeRole("")).toBe("user")
    })
  })
})
