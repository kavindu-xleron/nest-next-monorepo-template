import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common"
import { ProblemDetailsFilter } from "./problem-details.filter"

describe("ProblemDetailsFilter", () => {
  let filter: ProblemDetailsFilter
  let mockResponse: {
    status: jest.Mock
    setHeader: jest.Mock
    json: jest.Mock
    getHeader: jest.Mock
  }
  let mockRequest: {
    url: string
    originalUrl?: string
    headers: Record<string, string>
  }
  let mockArgumentsHost: ArgumentsHost

  beforeEach(() => {
    filter = new ProblemDetailsFilter()

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      getHeader: jest.fn().mockReturnValue("test-request-id-123"),
    }

    mockRequest = {
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
  })

  it("should format HttpException into RFC 7807 problem details json", () => {
    const exception = new HttpException("Not Found", HttpStatus.NOT_FOUND)

    filter.catch(exception, mockArgumentsHost)

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

  it("should format generic Error into 500 problem details json", () => {
    const exception = new Error("Database connection lost")

    filter.catch(exception, mockArgumentsHost)

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR
    )
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "https://httpstatuses.com/500",
        status: 500,
        detail: "Database connection lost",
        instance: "/test-endpoint",
        requestId: "test-request-id-123",
      })
    )
  })
})
