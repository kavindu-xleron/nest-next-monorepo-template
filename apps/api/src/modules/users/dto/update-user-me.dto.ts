import { createZodDto } from "nestjs-zod"
import { UpdateUserMeSchema } from "@workspace/contracts"

export class UpdateUserMeDto extends createZodDto(UpdateUserMeSchema) {}
