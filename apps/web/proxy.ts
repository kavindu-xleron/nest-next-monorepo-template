import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

/**
 * Next.js 16 renamed Middleware to Proxy. The file must be called `proxy.ts` and
 * live beside `app/`; a `middleware.ts` here is simply never invoked, which is
 * the failure mode to watch for since every Clerk guide still names that file.
 *
 * Proxy runs on the Node.js runtime and the `runtime` config option is not
 * available — setting it throws.
 */
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"])

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    // Without `unauthenticatedUrl` this redirects to Clerk's hosted account
    // portal, silently bypassing the local /sign-in route. Setting it here
    // keeps the behaviour in code rather than depending on
    // NEXT_PUBLIC_CLERK_SIGN_IN_URL being present in every environment.
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
    })
  }
})

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
}
