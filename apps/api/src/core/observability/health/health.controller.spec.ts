import { ServiceUnavailableException } from "@nestjs/common"
import { HealthCheckService } from "@nestjs/terminus"
import { HealthController } from "./health.controller"
import { HealthService } from "./health.service"

describe("HealthController", () => {
  let controller: HealthController
  let healthService: HealthService
  let healthCheckService: HealthCheckService

  beforeEach(() => {
    healthService = new HealthService()
    healthCheckService = {
      check: jest.fn().mockImplementation(async () => {
        return {
          status: "ok",
          info: {},
          error: {},
          details: {},
        }
      }),
    } as unknown as HealthCheckService

    controller = new HealthController(healthCheckService, healthService)
  })

  describe("checkLiveness", () => {
    it("should return ok health check status", async () => {
      const result = await controller.checkLiveness()
      expect(result.status).toBe("ok")
    })
  })

  describe("checkReadiness", () => {
    it("should return ok health check status when not draining", async () => {
      const result = await controller.checkReadiness()
      expect(result.status).toBe("ok")
    })

    it("should throw ServiceUnavailableException when draining", () => {
      healthService.markDraining()
      expect(() => controller.checkReadiness()).toThrow(
        ServiceUnavailableException
      )
    })
  })
})
