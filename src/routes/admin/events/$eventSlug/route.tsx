import {
  Link,
  Outlet,
  createFileRoute,
  useLocation,
} from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getEventBySlug } from "@/server/functions/events"

export const Route = createFileRoute("/admin/events/$eventSlug")({
  beforeLoad: async ({ params }) => ({
    event: await getEventBySlug({ data: { slug: params.eventSlug } }),
  }),
  component: EventLayout,
})

const TABS = [
  { value: "overview", label: "Overview", to: "/admin/events/$eventSlug" },
  {
    value: "matches",
    label: "Matches",
    to: "/admin/events/$eventSlug/matches",
  },
  {
    value: "rankings",
    label: "Rankings",
    to: "/admin/events/$eventSlug/rankings",
  },
  {
    value: "control",
    label: "Control",
    to: "/admin/events/$eventSlug/control",
  },
] as const

function EventLayout() {
  const { event } = Route.useRouteContext()
  const { eventSlug } = Route.useParams()
  const { pathname } = useLocation()

  const active =
    TABS.find(
      (tab) => tab.value !== "overview" && pathname.endsWith(`/${tab.value}`)
    )?.value ?? "overview"

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold">{event.name}</h1>
        <Badge variant="secondary">{event.status.replace("_", " ")}</Badge>
        <Tabs value={active} className="ml-auto">
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} asChild>
                <Link to={tab.to} params={{ eventSlug }}>
                  {tab.label}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>
      <Outlet />
    </div>
  )
}
