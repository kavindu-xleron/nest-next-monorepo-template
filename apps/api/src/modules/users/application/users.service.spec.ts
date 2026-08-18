import { ConflictException, NotFoundException } from "@nestjs/common"
import { User } from "../domain/user.entity"
import { UsersRepository } from "../domain/users.repository"
import { UsersService } from "./users.service"

describe("UsersService", () => {
  let service: UsersService
  let repository: jest.Mocked<UsersRepository>

  const mockUser: User = {
    id: "019fead6-37f7-7699-809e-87d7e3df2971",
    externalId: "clerk_123",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    avatarUrl: null,
    role: "user",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  }

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByExternalId: jest.fn(),
      findPage: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>

    service = new UsersService(repository)
  })

  describe("findOne", () => {
    it("should return UserDto and strip internal externalId", async () => {
      repository.findById.mockResolvedValue(mockUser)

      const result = await service.findOne(mockUser.id)

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        avatarUrl: mockUser.avatarUrl,
        role: mockUser.role,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      })
      expect(result).not.toHaveProperty("externalId")
      expect(result).not.toHaveProperty("clerkId")
    })

    it("should throw NotFoundException if user is not found", async () => {
      repository.findById.mockResolvedValue(null)

      await expect(service.findOne("non-existent-id")).rejects.toThrow(
        NotFoundException
      )
    })
  })

  describe("create", () => {
    it("should throw ConflictException if email is already registered", async () => {
      repository.findByEmail.mockResolvedValue(mockUser)

      await expect(
        service.create({ email: "test@example.com", role: "user" })
      ).rejects.toThrow(ConflictException)
    })

    it("should create user and return UserDto if email is unique", async () => {
      repository.findByEmail.mockResolvedValue(null)
      repository.create.mockResolvedValue(mockUser)

      const result = await service.create({
        email: "test@example.com",
        role: "user",
      })

      expect(result.email).toBe("test@example.com")
      expect(repository.create).toHaveBeenCalledTimes(1)
    })
  })

  describe("ensureJitUser", () => {
    it("should skip repository update when claims have not drifted", async () => {
      repository.findByExternalId.mockResolvedValue(mockUser)

      const result = await service.ensureJitUser({
        externalId: "clerk_123",
        email: "test@example.com",
        role: "user",
        firstName: "Test",
        lastName: "User",
      })

      expect(result.id).toBe(mockUser.id)
      expect(repository.update).not.toHaveBeenCalled()
    })

    it("should invoke repository update when claims have drifted", async () => {
      repository.findByExternalId.mockResolvedValue(mockUser)
      repository.update.mockResolvedValue({
        ...mockUser,
        firstName: "UpdatedName",
      })

      const result = await service.ensureJitUser({
        externalId: "clerk_123",
        email: "test@example.com",
        role: "user",
        firstName: "UpdatedName",
        lastName: "User",
      })

      expect(result.firstName).toBe("UpdatedName")
      expect(repository.update).toHaveBeenCalledTimes(1)
    })
  })

  describe("remove", () => {
    it("should throw NotFoundException if user to delete does not exist", async () => {
      repository.findById.mockResolvedValue(null)

      await expect(service.remove("non-existent-id")).rejects.toThrow(
        NotFoundException
      )
    })

    it("should invoke repository softDelete if user exists", async () => {
      repository.findById.mockResolvedValue(mockUser)
      repository.softDelete.mockResolvedValue(undefined)

      await service.remove(mockUser.id)

      expect(repository.softDelete).toHaveBeenCalledWith(mockUser.id)
    })
  })
})
