import { Link, createFileRoute } from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { listPublicEvents } from "@/server/functions/display"

export const Route = createFileRoute("/")({
  loader: () => listPublicEvents(),
  component: Landing,
})

function Landing() {
  const events = Route.useLoaderData()

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-4 text-center text-sm">
        <h1 className="font-medium">MiniSystem</h1>
        <p className="text-muted-foreground">
          Field management for MiniFRC events.
        </p>
        {events.length > 0 && (
          <div className="flex flex-col gap-2 text-left">
            {events.map((event) => (
              <Button
                key={event.id}
                asChild
                variant="outline"
                className="justify-between"
              >
                <Link
                  to="/public/$eventSlug"
                  params={{ eventSlug: event.slug }}
                >
                  {event.name}
                  <Badge variant="secondary">
                    {event.status.replace("_", " ")}
                  </Badge>
                </Link>
              </Button>
            ))}
          </div>
        )}
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    </main>
  )
}
