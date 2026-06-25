import { Link, createFileRoute, redirect } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { listPublicEvents } from "@/server/functions/display"

export const Route = createFileRoute("/")({
  // The public event page is the app's front door: send visitors straight to
  // the newest event. The page itself carries a dropdown to switch events.
  loader: async () => {
    const events = await listPublicEvents()
    if (events.length > 0) {
      throw redirect({
        to: "/public/$eventSlug",
        params: { eventSlug: events[0].slug },
      })
    }
    return { events }
  },
  component: Landing,
})

function Landing() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-4 text-center text-sm">
        <h1 className="font-medium">MiniSystem</h1>
        <p className="text-muted-foreground">
          Field management for MiniFRC events. No events are published yet.
        </p>
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    </main>
  )
}
