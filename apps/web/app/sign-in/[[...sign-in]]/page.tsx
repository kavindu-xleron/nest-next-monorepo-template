import { SignIn } from "@clerk/nextjs"

// The optional catch-all segment lets Clerk own its sub-routes (factor-one,
// factor-two, SSO callback) under this single page.
export default function SignInPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <SignIn />
    </main>
  )
}
