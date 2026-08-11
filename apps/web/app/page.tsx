import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import Link from "next/link"

export default function Page() {
  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium">Project ready!</h1>
          <p>You may now add components and start building.</p>
        </div>

        {/* Clerk v7 replaced <SignedIn>/<SignedOut> with a single <Show when>. */}
        <Show
          when="signed-in"
          fallback={
            <div className="flex gap-2">
              <SignInButton mode="modal">
                <Button size="sm">Sign in</Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="sm" variant="outline">
                  Sign up
                </Button>
              </SignUpButton>
            </div>
          }
        >
          <div className="flex items-center gap-3">
            <UserButton />
            <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
              Go to dashboard
            </Link>
          </div>
        </Show>

        <div className="font-mono text-xs text-muted-foreground">
          (Press <kbd>d</kbd> to toggle dark mode)
        </div>
      </div>
    </div>
  )
}
