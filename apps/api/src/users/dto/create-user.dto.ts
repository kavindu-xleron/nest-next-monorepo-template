import { createZodDto } from "nestjs-zod"
import { CreateUserSchema } from "@workspace/contracts"

export class CreateUserDto extends createZodDto(CreateUserSchema) {}
