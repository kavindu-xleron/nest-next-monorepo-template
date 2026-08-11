import { UserButton } from "@clerk/nextjs"
import { buttonVariants } from "@workspace/ui/components/button"
import Link from "next/link"
import { ApiError, getCurrentUser } from "@/lib/api-client"

/**
 * Protected by `proxy.ts`, but it also fetches with the caller's own token and
 * the API authorizes independently. The proxy is a redirect for humans, not the
 * security boundary — Next's own docs warn that a matcher change can silently
 * drop coverage, so authorization is never left to it alone.
 */
export default async function DashboardPage() {
  let user
  let error: ApiError | undefined

  try {
    user = await getCurrentUser()
  } catch (caught) {
    if (!(caught instanceof ApiError)) throw caught
    error = caught
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Dashboard</h1>
        <UserButton />
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/40 p-4 text-sm">
          <p className="font-medium">Could not load your profile</p>
          <p className="text-muted-foreground">
            {error.status} — {error.detail}
          </p>
          {error.requestId ? (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              request id: {error.requestId}
            </p>
          ) : null}
        </div>
      ) : (
        <dl className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd>
            {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—"}
          </dd>

          <dt className="text-muted-foreground">Email</dt>
          <dd>{user?.email}</dd>

          <dt className="text-muted-foreground">Role</dt>
          <dd>{user?.role}</dd>

          <dt className="text-muted-foreground">User ID</dt>
          <dd className="font-mono text-xs break-all">{user?.id}</dd>
        </dl>
      )}

      <p className="text-xs text-muted-foreground">
        This profile came from the Nest API at <code>GET /api/v1/users/me</code>
        , authenticated with your Clerk session token and parsed against the
        shared <code>UserSchema</code> contract.
      </p>

      <Link
        href="/"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        Back home
      </Link>
    </main>
  )
}
