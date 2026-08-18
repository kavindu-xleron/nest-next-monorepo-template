import { Controller, Get, ServiceUnavailableException } from "@nestjs/common"
import { HealthCheck, HealthCheckService } from "@nestjs/terminus"
import { Public } from "@core/auth/decorators/public.decorator"
import { HealthService } from "./health.service"

@Controller("health")
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly healthService: HealthService
  ) {}

  @Public()
  @Get("live")
  @HealthCheck()
  checkLiveness() {
    return this.healthCheckService.check([])
  }

  @Public()
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
