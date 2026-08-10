import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common"
import { Request, Response } from "express"
import { isHealthRoute } from "../http/health-route"

export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
  instance: string
  requestId?: string
  timestamp: string
  errors?: unknown
}

/**
 * Sent instead of the real message whenever a failure was not something we
 * deliberately authored client-facing text for. Raw error strings routinely
 * carry SQL fragments, table names, file paths and hostnames; none of that
 * belongs in a response. The real message goes to the log instead, tied back to
 * the response through `requestId`.
 */
const OPAQUE_DETAIL = "An unexpected error occurred"

interface DescribedFailure {
  status: number
  title: string
  detail: string
  errors?: unknown
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const failure = this.describe(exception)
    const requestId = this.resolveRequestId(request, response)

    this.log(exception, failure.status, request, requestId)

    const problem: ProblemDetails = {
      type: `https://httpstatuses.com/${failure.status}`,
      title: failure.title,
      status: failure.status,
      detail: failure.detail,
      instance: request.originalUrl || request.url,
      ...(requestId ? { requestId } : {}),
      timestamp: new Date().toISOString(),
      ...(failure.errors ? { errors: failure.errors } : {}),
    }

    response
      .status(failure.status)
      .setHeader("Content-Type", "application/problem+json")
      .json(problem)
  }

  /**
   * Maps a thrown value onto the response body.
   *
   * Only `HttpException` messages are echoed back, because those strings were
   * written by us for callers to read. Everything else — a driver error, a
   * bare `throw "boom"`, a rejected promise carrying an object — is reported
   * opaquely regardless of its type.
   */
  private describe(exception: unknown): DescribedFailure {
    if (!(exception instanceof HttpException)) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        title: "Internal Server Error",
        detail: OPAQUE_DETAIL,
      }
    }

    const status = exception.getStatus()
    const body = exception.getResponse()

    if (typeof body === "string") {
      return { status, title: exception.name, detail: body }
    }

    if (typeof body !== "object" || body === null) {
      return { status, title: exception.name, detail: OPAQUE_DETAIL }
    }

    const record = body as Record<string, unknown>
    const title =
      typeof record.error === "string" ? record.error : exception.name

    // Nest's ValidationPipe reports field failures as a string array.
    if (Array.isArray(record.message)) {
      return {
        status,
        title,
        detail: "Validation failed",
        errors: record.message,
      }
    }

    if (typeof record.message === "string") {
      return { status, title, detail: record.message }
    }

    return { status, title, detail: OPAQUE_DETAIL }
  }

  /**
   * Emits the one log line for this failure.
   *
   * The level follows the response status rather than the thrown type. Keying
   * off the type instead lets an `InternalServerErrorException` — a 500 that
   * very much wants a stack trace — pass by unlogged, and lets a non-`Error`
   * throw disappear entirely.
   */
  private log(
    exception: unknown,
    status: number,
    request: Request,
    requestId?: string
  ): void {
    if (isHealthRoute(request.originalUrl || request.url)) {
      return
    }

    const route = `${request.method} ${request.originalUrl || request.url}`
    const reference = requestId ? ` [${requestId}]` : ""
    const message = `${route} -> ${status}${reference}: ${this.causeOf(exception)}`

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        message,
        exception instanceof Error ? exception.stack : undefined
      )
      return
    }

    this.logger.warn(message)
  }

  /** Best-effort human-readable cause, for the log only — never for the response. */
  private causeOf(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.message
    }

    if (typeof exception === "string") {
      return exception
    }

    try {
      return JSON.stringify(exception) ?? String(exception)
    } catch {
      // Circular structures and the like.
      return String(exception)
    }
  }

  private resolveRequestId(
    request: Request,
    response: Response
  ): string | undefined {
    const echoed = response.getHeader("x-request-id")
    if (typeof echoed === "string") {
      return echoed
    }

    const inbound = request.headers["x-request-id"]
    if (typeof inbound === "string") {
      return inbound
    }

    return (request as Request & { id?: string }).id
  }
}
