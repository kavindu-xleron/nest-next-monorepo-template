import { z } from "zod"

export const UserRoleSchema = z.enum(["user", "admin"])
export type UserRole = z.infer<typeof UserRoleSchema>

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  role: UserRoleSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type UserDto = z.infer<typeof UserSchema>

export const CreateUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  avatarUrl: z.string().optional(),
  role: UserRoleSchema.default("user"),
})

export type CreateUserDto = z.infer<typeof CreateUserSchema>

export const UpdateUserSchema = CreateUserSchema.partial()
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>

export const UpdateUserMeSchema = CreateUserSchema.omit({
  role: true,
}).partial()
export type UpdateUserMeDto = z.infer<typeof UpdateUserMeSchema>
