import { Link, Outlet, createFileRoute } from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import { getEvent } from "@/server/functions/events"

export const Route = createFileRoute("/admin/events/$eventId")({
  loader: ({ params }) => getEvent({ data: { eventId: params.eventId } }),
  component: EventLayout,
})

function EventLayout() {
  const event = Route.useLoaderData()
  const { eventId } = Route.useParams()

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <h1 className="text-sm font-medium">{event.name}</h1>
        <Badge>{event.status}</Badge>
        <nav className="flex items-center gap-3 text-xs">
          <Link
            to="/admin/events/$eventId"
            params={{ eventId }}
            activeOptions={{ exact: true }}
            className="hover:underline [&.active]:underline"
          >
            Roster
          </Link>
          <Link
            to="/admin/events/$eventId/matches"
            params={{ eventId }}
            className="hover:underline [&.active]:underline"
          >
            Matches
          </Link>
          <Link
            to="/admin/events/$eventId/rankings"
            params={{ eventId }}
            className="hover:underline [&.active]:underline"
          >
            Rankings
          </Link>
          <Link
            to="/admin/events/$eventId/control"
            params={{ eventId }}
            className="hover:underline [&.active]:underline"
          >
            Control
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
