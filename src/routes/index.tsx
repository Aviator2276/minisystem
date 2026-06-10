import { Link, createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/")({ component: Landing })

function Landing() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex max-w-md flex-col gap-4 text-center text-sm">
        <h1 className="font-medium">MiniSystem</h1>
        <p className="text-muted-foreground">
          Field management for MiniFRC events.
        </p>
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    </main>
  )
}
