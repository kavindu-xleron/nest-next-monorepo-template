import { createZodDto } from "nestjs-zod"
import { UpdateUserSchema } from "@workspace/contracts"

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
