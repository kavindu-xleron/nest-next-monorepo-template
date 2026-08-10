import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common"
import { Request, Response } from "express"

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

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let title = "Internal Server Error"
    let detail = "An unexpected error occurred"
    let errors: unknown = undefined

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const exceptionResponse = exception.getResponse()

      if (typeof exceptionResponse === "string") {
        detail = exceptionResponse
      } else if (
        typeof exceptionResponse === "object" &&
        exceptionResponse !== null
      ) {
        const resObj = exceptionResponse as Record<string, unknown>
        title = (resObj.error as string) || exception.name || title
        if (Array.isArray(resObj.message)) {
          errors = resObj.message
          detail = "Validation failed"
        } else if (typeof resObj.message === "string") {
          detail = resObj.message
        }
      }
    } else if (exception instanceof Error) {
      detail = exception.message
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack
      )
    }

    const reqIdHeader = response.getHeader("x-request-id")
    const requestId =
      (typeof reqIdHeader === "string" ? reqIdHeader : undefined) ||
      (request.headers["x-request-id"] as string) ||
      (request as Request & { id?: string }).id

    const problem: ProblemDetails = {
      type: `https://httpstatuses.com/${status}`,
      title,
      status,
      detail,
      instance: request.originalUrl || request.url,
      ...(requestId ? { requestId } : {}),
      timestamp: new Date().toISOString(),
      ...(errors ? { errors } : {}),
    }

    response
      .status(status)
      .setHeader("Content-Type", "application/problem+json")
      .json(problem)
  }
}
