import { Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { HttpAdapterHost } from "@nestjs/core"
import { PinoLogger } from "nestjs-pino"
import { GracefulShutdownService } from "./graceful-shutdown.service"
import { HealthService } from "./health.service"

/**
 * Builds a ConfigService stub that answers from `values`, falling back to the
 * default the caller passed to `get(key, default)`.
 */
function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string, defaultValue?: unknown) =>
      key in values ? values[key] : defaultValue
    ),
  } as unknown as ConfigService
}

function createHttpAdapterHost(server: unknown): HttpAdapterHost {
  return {
    httpAdapter: { getHttpServer: () => server },
  } as unknown as HttpAdapterHost
}

function createPinoLogger(flush: jest.Mock = jest.fn()): PinoLogger {
  return { logger: { flush } } as unknown as PinoLogger
}

describe("GracefulShutdownService", () => {
  let healthService: HealthService
  let closeIdleConnections: jest.Mock
  let httpAdapterHost: HttpAdapterHost
  let warn: jest.SpyInstance

  beforeEach(() => {
    healthService = new HealthService()
    closeIdleConnections = jest.fn()
    httpAdapterHost = createHttpAdapterHost({ closeIdleConnections })

    // Keep shutdown chatter out of the test output.
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => {})
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {})
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("marks readiness as draining and hangs up idle connections", async () => {
    const service = new GracefulShutdownService(
      healthService,
      createConfigService({ NODE_ENV: "test" }),
      httpAdapterHost,
      createPinoLogger()
    )

    await service.beforeApplicationShutdown("SIGTERM")

    expect(healthService.isDraining()).toBe(true)
    expect(closeIdleConnections).toHaveBeenCalledTimes(1)
  })

  it("fails readiness immediately but closes idle connections only after the drain", async () => {
    const service = new GracefulShutdownService(
      healthService,
      createConfigService({ NODE_ENV: "production", DRAIN_INTERVAL_MS: 40 }),
      httpAdapterHost,
      createPinoLogger()
    )

    const pending = service.beforeApplicationShutdown("SIGTERM")

    // Readiness has to flip before the wait, so the load balancer stops routing
    // to us while in-flight work is still allowed to finish.
    expect(healthService.isDraining()).toBe(true)
    expect(closeIdleConnections).not.toHaveBeenCalled()

    await pending

    expect(closeIdleConnections).toHaveBeenCalledTimes(1)
  })

  it("warns rather than throwing when the server cannot close idle connections", async () => {
    const service = new GracefulShutdownService(
      healthService,
      createConfigService({ NODE_ENV: "test" }),
      createHttpAdapterHost({}),
      createPinoLogger()
    )

    await expect(
      service.beforeApplicationShutdown("SIGTERM")
    ).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("closeIdleConnections")
    )
  })

  it("clears the force-exit timer once shutdown completes cleanly", async () => {
    const service = new GracefulShutdownService(
      healthService,
      createConfigService({ NODE_ENV: "test" }),
      httpAdapterHost,
      createPinoLogger()
    )
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout")

    await service.beforeApplicationShutdown("SIGTERM")
    service.onApplicationShutdown("SIGTERM")

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it("flushes buffered logs before force-exiting on the deadline", async () => {
    const exit = jest
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never)

    let flushCallback: (() => void) | undefined
    const flush = jest.fn((cb?: () => void) => {
      flushCallback = cb
    })

    const service = new GracefulShutdownService(
      healthService,
      createConfigService({ NODE_ENV: "test", SHUTDOWN_TIMEOUT_MS: 10 }),
      httpAdapterHost,
      createPinoLogger(flush)
    )

    await service.beforeApplicationShutdown("SIGTERM")
    await new Promise((resolve) => setTimeout(resolve, 40))

    // The deadline has passed, so we are on our way out — but not before the
    // log explaining why has actually been written.
    expect(flush).toHaveBeenCalledTimes(1)
    expect(exit).not.toHaveBeenCalled()

    flushCallback?.()

    expect(exit).toHaveBeenCalledWith(1)
  })
})
