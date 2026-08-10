import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common"
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"
import {
  CreateUserDto,
  CursorPaginationQueryDto,
  PaginatedResponseDto,
  UpdateUserDto,
  UserDto,
} from "@workspace/contracts"
import { UsersService } from "./users.service"

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @ApiOperation({ summary: "Get current authenticated user profile" })
  @ApiOkResponse({ description: "Current user profile" })
  @ApiNotFoundResponse({ description: "No active user profile found" })
  async findMe(): Promise<UserDto> {
    return this.usersService.findMe()
  }

  @Get()
  @ApiOperation({ summary: "Get cursor-paginated list of users" })
  @ApiOkResponse({ description: "Paginated users response" })
  async findAll(
    @Query() query: CursorPaginationQueryDto
  ): Promise<PaginatedResponseDto<UserDto>> {
    return this.usersService.findAll(query)
  }

  @Get(":id")
  @ApiOperation({ summary: "Get user by ID" })
  @ApiOkResponse({ description: "User details" })
  @ApiNotFoundResponse({ description: "User not found" })
  async findOne(@Param("id") id: string): Promise<UserDto> {
    return this.usersService.findOne(id)
  }

  @Post()
  @ApiOperation({ summary: "Create a new user" })
  @ApiCreatedResponse({ description: "User successfully created" })
  @ApiConflictResponse({ description: "User with email already exists" })
  async create(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.usersService.create(dto)
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update user details by ID" })
  @ApiOkResponse({ description: "User successfully updated" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiConflictResponse({ description: "Email already taken" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto
  ): Promise<UserDto> {
    return this.usersService.update(id, dto)
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft delete user by ID" })
  @ApiNoContentResponse({ description: "User successfully deleted" })
  @ApiNotFoundResponse({ description: "User not found" })
  async remove(@Param("id") id: string): Promise<void> {
    return this.usersService.remove(id)
  }
}
