import { DatabaseService } from "./database.module"

describe("DatabaseService", () => {
  it("should call pool.end() on application shutdown", async () => {
    const mockPool = {
      end: jest.fn().mockResolvedValue(undefined),
    }

    const service = new DatabaseService(mockPool as any)
    await service.onApplicationShutdown("SIGTERM")

    expect(mockPool.end).toHaveBeenCalledTimes(1)
  })
})
