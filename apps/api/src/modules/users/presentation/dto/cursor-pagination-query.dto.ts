import { createZodDto } from "nestjs-zod"
import { CursorPaginationQuerySchema } from "@workspace/contracts"

export class CursorPaginationQueryDto extends createZodDto(
  CursorPaginationQuerySchema
) {}
