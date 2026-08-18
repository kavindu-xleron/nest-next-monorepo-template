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
import { User, UserRole } from "../domain/user.entity"
import { UsersRepository } from "../domain/users.repository"

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findMe(userId?: string): Promise<UserDto> {
    if (userId) {
      return this.findOne(userId)
    }

    const page = await this.usersRepository.findPage(undefined, 1)
    const firstUser = page.items[0]
    if (!firstUser) {
      throw new NotFoundException("No active user profile found")
    }

    return this.toUserDto(firstUser)
  }

  async findAll(
    query: CursorPaginationQueryDto
  ): Promise<PaginatedResponseDto<UserDto>> {
    const page = await this.usersRepository.findPage(query.cursor, query.limit)

    return {
      items: page.items.map((user) => this.toUserDto(user)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
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
      role: dto.role === "admin" ? "admin" : "user",
      externalId: `clerk_dev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
      ...(dto.role !== undefined && {
        role: dto.role === "admin" ? "admin" : "user",
      }),
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

  async removeByExternalId(externalId: string): Promise<void> {
    const existing = await this.usersRepository.findByExternalId(externalId)
    if (existing) {
      await this.usersRepository.softDelete(existing.id)
    }
  }

  /**
   * Just-in-Time (JIT) provision/synchronization of local Postgres user record.
   * Compares incoming payload against existing user to skip unnecessary database writes.
   */
  async ensureJitUser(payload: {
    externalId: string
    email: string
    role?: string
    firstName?: string | null
    lastName?: string | null
  }): Promise<UserDto> {
    const { externalId } = payload
    const existing = await this.usersRepository.findByExternalId(externalId)
    if (existing) {
      const targetRole: UserRole = payload.role
        ? payload.role === "admin"
          ? "admin"
          : "user"
        : existing.role
      const targetFirstName =
        payload.firstName !== undefined ? payload.firstName : existing.firstName
      const targetLastName =
        payload.lastName !== undefined ? payload.lastName : existing.lastName

      const drifted =
        existing.email !== payload.email ||
        existing.role !== targetRole ||
        existing.firstName !== targetFirstName ||
        existing.lastName !== targetLastName

      if (!drifted) {
        return this.toUserDto(existing)
      }

      const updated = await this.usersRepository.update(existing.id, {
        email: payload.email,
        ...(payload.role !== undefined && {
          role: payload.role === "admin" ? "admin" : "user",
        }),
        ...(payload.firstName !== undefined && {
          firstName: payload.firstName,
        }),
        ...(payload.lastName !== undefined && { lastName: payload.lastName }),
      })
      return this.toUserDto(updated || existing)
    }

    const existingByEmail = await this.usersRepository.findByEmail(
      payload.email
    )
    if (existingByEmail) {
      const updated = await this.usersRepository.update(existingByEmail.id, {
        externalId,
        ...(payload.role !== undefined && {
          role: payload.role === "admin" ? "admin" : "user",
        }),
        ...(payload.firstName !== undefined && {
          firstName: payload.firstName,
        }),
        ...(payload.lastName !== undefined && { lastName: payload.lastName }),
      })
      return this.toUserDto(updated!)
    }

    const created = await this.usersRepository.create({
      externalId,
      email: payload.email,
      role: payload.role === "admin" ? "admin" : "user",
      firstName: payload.firstName || null,
      lastName: payload.lastName || null,
    })

    return this.toUserDto(created)
  }

  /**
   * Whitelisting: Transforms domain User entity into public UserDto contract,
   * guaranteeing internal fields (externalId, etc.) are stripped.
   */
  private toUserDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  }
}
