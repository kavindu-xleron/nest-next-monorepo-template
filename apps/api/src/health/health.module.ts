import { Module } from "@nestjs/common"
import { TerminusModule } from "@nestjs/terminus"
import { GracefulShutdownService } from "./graceful-shutdown.service"
import { HealthController } from "./health.controller"
import { HealthService } from "./health.service"

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [HealthService, GracefulShutdownService],
  exports: [HealthService],
})
export class HealthModule {}
