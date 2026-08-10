import { Controller, Get, ServiceUnavailableException } from "@nestjs/common"
import { HealthCheck, HealthCheckService } from "@nestjs/terminus"
import { HealthService } from "./health.service"

@Controller("health")
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly healthService: HealthService
  ) {}

  @Get("live")
  @HealthCheck()
  checkLiveness() {
    return this.healthCheckService.check([])
  }

  @Get("ready")
  @HealthCheck()
  checkReadiness() {
    if (this.healthService.isDraining()) {
      throw new ServiceUnavailableException({
        status: "error",
        message: "Server is draining and shutting down",
      })
    }
    return this.healthCheckService.check([])
  }
}
