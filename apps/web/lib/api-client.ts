import { auth } from "@clerk/nextjs/server"
import {
  createPaginatedResponseSchema,
  UserSchema,
  type PaginatedResponseDto,
  type UserDto,
} from "@workspace/contracts"
import { z } from "zod"
import { API_BASE_URL } from "./env"

/**
 * Server-side client for the Nest API.
 *
 * Two things make this more than a `fetch` wrapper:
 *
 * - Responses are **parsed** against the same contract schemas the API
 *   validates with, not cast. If the two drift apart it fails here, at the
 *   boundary, rather than as a confusing `undefined` deep in a component.
 * - Failures carry the API's `requestId` through, so a message shown to a user
 *   can be traced to the exact request in the API logs.
 *
 * These helpers call Clerk's `auth()`, so they only run on the server — in
 * server components, route handlers, or server actions.
 */

/** The RFC 7807 body the API's global exception filter returns. */
const ProblemDetailsSchema = z.object({
  title: z.string(),
  status: z.number(),
  detail: z.string(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.unknown().optional(),
})

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly requestId?: string
  ) {
    super(detail)
    this.name = "ApiError"
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const headerRequestId = response.headers.get("x-request-id") ?? undefined

  try {
    const problem = ProblemDetailsSchema.parse(await response.json())
    return new ApiError(
      problem.status,
      problem.detail,
      problem.requestId ?? headerRequestId
    )
  } catch {
    // A proxy or crash can return something that is not problem+json.
    return new ApiError(
      response.status,
      response.statusText || "Request failed",
      headerRequestId
    )
  }
}

async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit
): Promise<T> {
  const { getToken } = await auth()
  const token = await getToken()

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    // Every response here is scoped to one user; caching would serve one
    // person's data to another.
    cache: "no-store",
  })

  if (!response.ok) {
    throw await toApiError(response)
  }

  return schema.parse(await response.json())
}

const PaginatedUsersSchema = createPaginatedResponseSchema(UserSchema)

/** The signed-in user's own profile. */
export function getCurrentUser(): Promise<UserDto> {
  return apiFetch("/users/me", UserSchema)
}

/** Admin-only: a cursor-paginated page of users. */
export function listUsers(params: { cursor?: string; limit?: number } = {}) {
  const query = new URLSearchParams()
  if (params.cursor) query.set("cursor", params.cursor)
  if (params.limit) query.set("limit", String(params.limit))

  const suffix = query.size > 0 ? `?${query.toString()}` : ""
  return apiFetch(`/users${suffix}`, PaginatedUsersSchema) as Promise<
    PaginatedResponseDto<UserDto>
  >
}
