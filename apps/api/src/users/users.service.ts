import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  CreateUserDto,
  CursorPaginationQueryDto,
  PaginatedResponseDto,
  UpdateUserDto,
  UserDto,
} from "@workspace/contracts"
import { User } from "../database/schema/users"
import { UsersRepository } from "./users.repository"

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findMe(): Promise<UserDto> {
    const paginated = await this.usersRepository.findPaginated(undefined, 1)
    const firstUser = paginated.items[0]
    if (!firstUser) {
      throw new NotFoundException("No active user profile found")
    }

    return this.toUserDto(firstUser)
  }

  async findAll(
    query: CursorPaginationQueryDto
  ): Promise<PaginatedResponseDto<UserDto>> {
    const result = await this.usersRepository.findPaginated(
      query.cursor,
      query.limit
    )

    return {
      items: result.items.map((user) => this.toUserDto(user)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    }
  }

  async findOne(id: string): Promise<UserDto> {
    const user = await this.usersRepository.findById(id)
    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`)
    }
    return this.toUserDto(user)
  }

  async create(dto: CreateUserDto): Promise<UserDto> {
    const existing = await this.usersRepository.findByEmail(dto.email)
    if (existing) {
      throw new ConflictException(
        `User with email '${dto.email}' already exists`
      )
    }

    const created = await this.usersRepository.create({
      email: dto.email,
      firstName: dto.firstName || null,
      lastName: dto.lastName || null,
      avatarUrl: dto.avatarUrl || null,
      role: dto.role || "user",
      clerkId: `clerk_dev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    })

    return this.toUserDto(created)
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDto> {
    await this.findOne(id)

    if (dto.email) {
      const existing = await this.usersRepository.findByEmail(dto.email)
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `User with email '${dto.email}' already exists`
        )
      }
    }

    const updated = await this.usersRepository.update(id, {
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      ...(dto.role !== undefined && { role: dto.role }),
    })

    if (!updated) {
      throw new NotFoundException(`User with ID '${id}' not found`)
    }

    return this.toUserDto(updated)
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id)
    await this.usersRepository.softDelete(id)
  }

  /**
   * Just-in-Time (JIT) provision/synchronization of local Postgres user record.
   */
  async ensureJitUser(payload: {
    clerkId: string
    email: string
    role?: string
    firstName?: string | null
    lastName?: string | null
  }): Promise<UserDto> {
    const existing = await this.usersRepository.findByClerkId(payload.clerkId)
    if (existing) {
      return this.toUserDto(existing)
    }

    const existingByEmail = await this.usersRepository.findByEmail(
      payload.email
    )
    if (existingByEmail) {
      const updated = await this.usersRepository.update(existingByEmail.id, {
        clerkId: payload.clerkId,
      })
      return this.toUserDto(updated!)
    }

    const created = await this.usersRepository.create({
      clerkId: payload.clerkId,
      email: payload.email,
      role: payload.role || "user",
      firstName: payload.firstName || null,
      lastName: payload.lastName || null,
    })

    return this.toUserDto(created)
  }

  /**
   * Whitelisting: Transforms database User entity into public UserDto contract,
   * guaranteeing internal fields (clerkId, deletedAt) are stripped.
   */
  private toUserDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      role: user.role as "user" | "admin",
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  }
}
