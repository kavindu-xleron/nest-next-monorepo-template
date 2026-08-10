import { ConflictException, NotFoundException } from "@nestjs/common"
import { UsersRepository } from "./users.repository"
import { UsersService } from "./users.service"

describe("UsersService", () => {
  let service: UsersService
  let repository: jest.Mocked<UsersRepository>

  const mockUserRow = {
    id: "019fead6-37f7-7699-809e-87d7e3df2971",
    clerkId: "clerk_123",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    avatarUrl: null,
    role: "user",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
  }

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByClerkId: jest.fn(),
      findPaginated: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>

    service = new UsersService(repository)
  })

  describe("findOne", () => {
    it("should return UserDto and strip internal clerkId and deletedAt fields", async () => {
      repository.findById.mockResolvedValue(mockUserRow)

      const result = await service.findOne(mockUserRow.id)

      expect(result).toEqual({
        id: mockUserRow.id,
        email: mockUserRow.email,
        firstName: mockUserRow.firstName,
        lastName: mockUserRow.lastName,
        avatarUrl: mockUserRow.avatarUrl,
        role: mockUserRow.role,
        createdAt: mockUserRow.createdAt,
        updatedAt: mockUserRow.updatedAt,
      })
      expect(result).not.toHaveProperty("clerkId")
      expect(result).not.toHaveProperty("deletedAt")
    })

    it("should throw NotFoundException if user is not found", async () => {
      repository.findById.mockResolvedValue(undefined)

      await expect(service.findOne("non-existent-id")).rejects.toThrow(
        NotFoundException
      )
    })
  })

  describe("create", () => {
    it("should throw ConflictException if email is already registered", async () => {
      repository.findByEmail.mockResolvedValue(mockUserRow)

      await expect(
        service.create({ email: "test@example.com", role: "user" })
      ).rejects.toThrow(ConflictException)
    })

    it("should create user and return UserDto if email is unique", async () => {
      repository.findByEmail.mockResolvedValue(undefined)
      repository.create.mockResolvedValue(mockUserRow)

      const result = await service.create({
        email: "test@example.com",
        role: "user",
      })

      expect(result.email).toBe("test@example.com")
      expect(repository.create).toHaveBeenCalledTimes(1)
    })
  })

  describe("remove", () => {
    it("should throw NotFoundException if user to delete does not exist", async () => {
      repository.findById.mockResolvedValue(undefined)

      await expect(service.remove("non-existent-id")).rejects.toThrow(
        NotFoundException
      )
    })

    it("should invoke repository softDelete if user exists", async () => {
      repository.findById.mockResolvedValue(mockUserRow)
      repository.softDelete.mockResolvedValue({
        ...mockUserRow,
        deletedAt: new Date(),
      })

      await service.remove(mockUserRow.id)

      expect(repository.softDelete).toHaveBeenCalledWith(mockUserRow.id)
    })
  })
})
