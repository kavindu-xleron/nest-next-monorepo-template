import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"
import { PaginatedResponseDto, UserDto } from "@workspace/contracts"
import { CurrentUser } from "@core/auth/decorators/current-user.decorator"
import { Roles } from "@core/auth/decorators/roles.decorator"
import {
  CreateUserDto,
  CursorPaginationQueryDto,
  UpdateUserDto,
  UpdateUserMeDto,
} from "./dto"
import { UsersService } from "../application/users.service"

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @ApiOperation({ summary: "Get current authenticated user profile" })
  @ApiOkResponse({ description: "Current user profile" })
  @ApiNotFoundResponse({ description: "No active user profile found" })
  async findMe(@CurrentUser() user: UserDto): Promise<UserDto> {
    return this.usersService.findMe(user?.id)
  }

  @Patch("me")
  @ApiOperation({ summary: "Update current authenticated user profile" })
  @ApiOkResponse({ description: "Profile successfully updated" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiConflictResponse({ description: "Email already taken" })
  async updateMe(
    @CurrentUser() user: UserDto,
    @Body() dto: UpdateUserMeDto
  ): Promise<UserDto> {
    return this.usersService.update(user.id, dto)
  }

  @Get()
  @Roles("admin")
  @ApiOperation({ summary: "Get cursor-paginated list of users (Admin only)" })
  @ApiOkResponse({ description: "Paginated users response" })
  @ApiForbiddenResponse({ description: "Admin role required" })
  async findAll(
    @Query() query: CursorPaginationQueryDto
  ): Promise<PaginatedResponseDto<UserDto>> {
    return this.usersService.findAll(query)
  }

  @Get(":id")
  @ApiOperation({ summary: "Get user by ID (Self or Admin)" })
  @ApiOkResponse({ description: "User details" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiForbiddenResponse({ description: "Access denied" })
  async findOne(
    @Param("id") id: string,
    @CurrentUser() currentUser: UserDto
  ): Promise<UserDto> {
    if (currentUser?.role !== "admin" && currentUser?.id !== id) {
      throw new ForbiddenException(
        "Access denied: You can only view your own user record"
      )
    }
    return this.usersService.findOne(id)
  }

  @Post()
  @Roles("admin")
  @ApiOperation({ summary: "Create a new user (Admin only)" })
  @ApiCreatedResponse({ description: "User successfully created" })
  @ApiConflictResponse({ description: "User with email already exists" })
  @ApiForbiddenResponse({ description: "Admin role required" })
  async create(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.usersService.create(dto)
  }

  @Patch(":id")
  @Roles("admin")
  @ApiOperation({ summary: "Update user details by ID (Admin only)" })
  @ApiOkResponse({ description: "User successfully updated" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiConflictResponse({ description: "Email already taken" })
  @ApiForbiddenResponse({ description: "Admin role required" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto
  ): Promise<UserDto> {
    return this.usersService.update(id, dto)
  }

  @Delete(":id")
  @Roles("admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft delete user by ID (Admin only)" })
  @ApiNoContentResponse({ description: "User successfully deleted" })
  @ApiNotFoundResponse({ description: "User not found" })
  @ApiForbiddenResponse({ description: "Admin role required" })
  async remove(@Param("id") id: string): Promise<void> {
    return this.usersService.remove(id)
  }
}
