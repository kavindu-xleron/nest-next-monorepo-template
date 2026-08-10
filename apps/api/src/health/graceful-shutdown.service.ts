import { Server } from "node:http"
import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { HttpAdapterHost } from "@nestjs/core"
import { PinoLogger } from "nestjs-pino"
import { HealthService } from "./health.service"

/** How long to wait for buffered logs to drain before giving up and exiting anyway. */
const LOG_FLUSH_TIMEOUT_MS = 1000

/**
 * Drives the shutdown sequence.
 *
 * Nest runs its lifecycle hooks in this order (see `close()` in
 * `@nestjs/core/nest-application-context.js`):
 *
 *   1. onModuleDestroy()
 *   2. beforeApplicationShutdown()  <- readiness flip and drain live here
 *   3. dispose()                    <- the HTTP server actually closes
 *   4. onApplicationShutdown()
 *
 * Two consequences worth knowing before adding anything to this sequence:
 *
 * - Step 1 runs *before* the drain. Any resource that in-flight requests still
 *   need — the database pool above all — must therefore be released in
 *   onApplicationShutdown (step 4), never onModuleDestroy (step 1). Closing the
 *   pool in step 1 would tear it down seconds before the server stops accepting
 *   traffic, failing every request that arrives during the drain window.
 *
 * - Step 3 calls `server.close()`, which waits for open sockets to go idle
 *   rather than cutting them off. See `closeIdleConnections` below.
 */
@Injectable()
export class GracefulShutdownService
  implements BeforeApplicationShutdown, OnApplicationShutdown
{
  private readonly logger = new Logger(GracefulShutdownService.name)
  private timeoutTimer?: NodeJS.Timeout

  constructor(
    private readonly healthService: HealthService,
    private readonly configService: ConfigService,
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly pinoLogger: PinoLogger
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
      this.flushLogsAndExit(1)
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

    this.closeIdleConnections()
  }

  /**
   * Hangs up idle keep-alive sockets before Nest closes the server.
   *
   * `server.close()` stops accepting new connections but waits for existing
   * ones to go idle on their own. A keep-alive socket only does that after
   * `keepAliveTimeout` (65s here), and load balancers hold such sockets open
   * continuously — so without this, close would still be waiting when the hard
   * deadline fires, and every ordinary deploy would end in a forced exit(1).
   *
   * `closeIdleConnections()` is the surgical form: it drops sockets sitting
   * idle and leaves sockets with a request in flight alone, so they still get
   * to finish. That is why this runs *after* the drain wait — by now the load
   * balancer has seen readiness fail and stopped sending new work.
   */
  private closeIdleConnections(): void {
    const server = this.httpAdapterHost.httpAdapter?.getHttpServer() as
      | Server
      | undefined

    if (typeof server?.closeIdleConnections !== "function") {
      this.logger.warn(
        "HTTP server does not expose closeIdleConnections(); idle keep-alive sockets may delay shutdown until keepAliveTimeout elapses."
      )
      return
    }

    server.closeIdleConnections()
    this.logger.log(
      "Step 4: Closed idle keep-alive connections. In-flight requests are still allowed to finish."
    )
  }

  /**
   * Exits, but not before buffered logs reach the destination.
   *
   * pino writes through an async transport (a worker thread whenever
   * pino-pretty is enabled), so a bare `process.exit()` discards anything still
   * queued — including the line explaining why we are exiting, which is the one
   * line anyone investigating a stuck deploy actually needs.
   *
   * The fallback timer is deliberate: this path only runs because something is
   * already hung, and a flush that never calls back must not be what keeps a
   * process alive that we have given up on.
   */
  private flushLogsAndExit(code: number): void {
    let exited = false
    const exit = () => {
      if (exited) {
        return
      }
      exited = true
      process.exit(code)
    }

    const fallback = setTimeout(exit, LOG_FLUSH_TIMEOUT_MS)

    try {
      this.pinoLogger.logger.flush(() => {
        clearTimeout(fallback)
        exit()
      })
    } catch {
      clearTimeout(fallback)
      exit()
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
