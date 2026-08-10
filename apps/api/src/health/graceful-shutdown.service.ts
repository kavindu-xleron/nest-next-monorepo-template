import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { HealthService } from "./health.service"

@Injectable()
export class GracefulShutdownService
  implements BeforeApplicationShutdown, OnApplicationShutdown
{
  private readonly logger = new Logger(GracefulShutdownService.name)
  private timeoutTimer?: NodeJS.Timeout

  constructor(
    private readonly healthService: HealthService,
    private readonly configService: ConfigService
  ) {}

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    this.logger.warn(
      `Received shutdown signal (${signal || "SIGTERM"}). Step 1: Marking application as draining (readiness failing)...`
    )
    this.healthService.markDraining()

    const isTest = this.configService.get<string>("NODE_ENV") === "test"
    const configuredDrain = this.configService.get<number>(
      "DRAIN_INTERVAL_MS",
      5000
    )
    const drainInterval = isTest ? 0 : configuredDrain

    const hardTimeout = this.configService.get<number>(
      "SHUTDOWN_TIMEOUT_MS",
      30000
    )

    this.timeoutTimer = setTimeout(() => {
      this.logger.error(
        `Graceful shutdown deadline (${hardTimeout}ms) exceeded. Force exiting process.`
      )
      process.exit(1)
    }, hardTimeout)
    this.timeoutTimer.unref()

    if (drainInterval > 0) {
      this.logger.log(
        `Step 2: Waiting drain interval (${drainInterval}ms) for load balancer health probes to register unready status...`
      )
      await new Promise((resolve) => setTimeout(resolve, drainInterval))
      this.logger.log(
        `Step 3: Drain interval elapsed. Proceeding with closing HTTP server and connections.`
      )
    }
  }

  onApplicationShutdown(signal?: string): void {
    this.logger.log(
      `All connections closed and application shutdown completed cleanly for signal: ${signal || "SIGTERM"}.`
    )
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer)
    }
  }
}
