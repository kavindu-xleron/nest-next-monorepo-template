import { UsersController } from "./users.controller"
import { UsersService } from "../application/users.service"

describe("UsersController", () => {
  let controller: UsersController
  let service: jest.Mocked<UsersService>

  const mockUserDto = {
    id: "019fead6-37f7-7699-809e-87d7e3df2971",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    avatarUrl: null,
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    service = {
      findMe: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<UsersService>

    controller = new UsersController(service)
  })

  it("findOne should delegate to service.findOne and return UserDto", async () => {
    service.findOne.mockResolvedValue(mockUserDto)

    const result = await controller.findOne(mockUserDto.id, mockUserDto)

    expect(result).toEqual(mockUserDto)
    expect(service.findOne).toHaveBeenCalledWith(mockUserDto.id)
  })

  it("create should delegate to service.create and return UserDto", async () => {
    service.create.mockResolvedValue(mockUserDto)

    const result = await controller.create({
      email: "test@example.com",
      role: "user",
    })

    expect(result).toEqual(mockUserDto)
    expect(service.create).toHaveBeenCalledWith({
      email: "test@example.com",
      role: "user",
    })
  })

  it("remove should delegate to service.remove", async () => {
    service.remove.mockResolvedValue(undefined)

    await controller.remove(mockUserDto.id)

    expect(service.remove).toHaveBeenCalledWith(mockUserDto.id)
  })
})
