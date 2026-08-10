import { expectTypeOf } from "expect-type"
import type { UserDto } from "./user.contract.js"

// Representation of internal Drizzle User row type for type-level conformance testing
interface DrizzleUserRow {
  id: string
  clerkId: string
  email: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  role: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

describe("User Contracts Conformance", () => {
  it("should conform UserDto public fields to DrizzleUserRow database fields", () => {
    // Assert that UserDto properties are assignable from database row properties
    expectTypeOf<UserDto["id"]>().toEqualTypeOf<DrizzleUserRow["id"]>()
    expectTypeOf<UserDto["email"]>().toEqualTypeOf<DrizzleUserRow["email"]>()
    expectTypeOf<UserDto["createdAt"]>().toEqualTypeOf<
      DrizzleUserRow["createdAt"]
    >()
    expectTypeOf<UserDto["updatedAt"]>().toEqualTypeOf<
      DrizzleUserRow["updatedAt"]
    >()
  })
})
