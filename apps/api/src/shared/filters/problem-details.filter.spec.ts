import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { ProblemDetailsFilter } from "./problem-details.filter"

const OPAQUE_DETAIL = "An unexpected error occurred"

describe("ProblemDetailsFilter", () => {
  let filter: ProblemDetailsFilter
  let mockResponse: {
    status: jest.Mock
    setHeader: jest.Mock
    json: jest.Mock
    getHeader: jest.Mock
  }
  let mockRequest: {
    method: string
    url: string
    originalUrl?: string
    headers: Record<string, string>
  }
  let mockArgumentsHost: ArgumentsHost
  let error: jest.SpyInstance
  let warn: jest.SpyInstance

  /** The body handed to `response.json()` on the most recent call. */
  const sentBody = (): Record<string, unknown> =>
    mockResponse.json.mock.calls[0]?.[0] as Record<string, unknown>

  beforeEach(() => {
    filter = new ProblemDetailsFilter()

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      getHeader: jest.fn().mockReturnValue("test-request-id-123"),
    }

    mockRequest = {
      method: "GET",
      url: "/test-endpoint",
      headers: {
        "x-request-id": "test-request-id-123",
      },
    }

    mockArgumentsHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost

    error = jest.spyOn(Logger.prototype, "error").mockImplementation(() => {})
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe("response shape", () => {
    it("formats an HttpException into RFC 7807 problem details", () => {
      filter.catch(
        new HttpException("Not Found", HttpStatus.NOT_FOUND),
        mockArgumentsHost
      )

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND)
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/problem+json"
      )
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "https://httpstatuses.com/404",
          status: 404,
          detail: "Not Found",
          instance: "/test-endpoint",
          requestId: "test-request-id-123",
        })
      )
    })

    it("surfaces field errors from a validation-style exception", () => {
      filter.catch(
        new HttpException(
          {
            error: "Bad Request",
            message: ["email must be an email"],
            statusCode: 400,
          },
          HttpStatus.BAD_REQUEST
        ),
        mockArgumentsHost
      )

      expect(sentBody()).toEqual(
        expect.objectContaining({
          status: 400,
          title: "Bad Request",
          detail: "Validation failed",
          errors: ["email must be an email"],
        })
      )
    })
  })

  describe("not leaking internals", () => {
    it("replaces a raw Error message with an opaque detail", () => {
      filter.catch(new Error("Database connection lost"), mockArgumentsHost)

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR
      )
      expect(sentBody()).toEqual(
        expect.objectContaining({
          status: 500,
          detail: OPAQUE_DETAIL,
          requestId: "test-request-id-123",
        })
      )
      // The real cause belongs in the log, tied back by requestId.
      expect(JSON.stringify(sentBody())).not.toContain("Database connection")
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("Database connection lost"),
        expect.any(String)
      )
    })

    it("reports a non-Error throw opaquely instead of silently defaulting", () => {
      filter.catch("boom", mockArgumentsHost)

      expect(sentBody()).toEqual(
        expect.objectContaining({ status: 500, detail: OPAQUE_DETAIL })
      )
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("boom"),
        undefined
      )
    })

    it("still echoes messages we authored ourselves", () => {
      filter.catch(
        new NotFoundException("No user exists with id 42"),
        mockArgumentsHost
      )

      expect(sentBody()).toEqual(
        expect.objectContaining({
          status: 404,
          title: "Not Found",
          detail: "No user exists with id 42",
        })
      )
    })
  })

  describe("log level follows status, not thrown type", () => {
    it("logs an HttpException-shaped 500 at error level with a stack", () => {
      filter.catch(new InternalServerErrorException(), mockArgumentsHost)

      expect(error).toHaveBeenCalledTimes(1)
      expect(warn).not.toHaveBeenCalled()
    })

    it("logs a 4xx at warn level", () => {
      filter.catch(new NotFoundException("nope"), mockArgumentsHost)

      expect(warn).toHaveBeenCalledTimes(1)
      expect(error).not.toHaveBeenCalled()
    })

    it("logs exactly once per failure", () => {
      filter.catch(new Error("kaboom"), mockArgumentsHost)

      expect(error.mock.calls.length + warn.mock.calls.length).toBe(1)
    })

    it("stays quiet for health probes so drains do not look like incidents", () => {
      mockRequest.url = "/health/ready"
      mockRequest.originalUrl = "/health/ready"

      filter.catch(
        new HttpException("draining", HttpStatus.SERVICE_UNAVAILABLE),
        mockArgumentsHost
      )

      expect(error).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
      // The caller is still told, it just is not logged as a failure.
      expect(mockResponse.status).toHaveBeenCalledWith(503)
    })
  })
})
