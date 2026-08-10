import { z } from "zod"

export const CursorPaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type CursorPaginationQueryDto = z.infer<
  typeof CursorPaginationQuerySchema
>

export interface PaginatedResponseDto<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(
  itemSchema: T
) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
}
