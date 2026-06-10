import { Link, createFileRoute } from "@tanstack/react-router"
import { MatchPointsChart } from "@/components/chart-area-interactive"
import { SectionCards } from "@/components/section-cards"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getAdminDashboard } from "@/server/functions/dashboard"

export const Route = createFileRoute("/admin/")({
  loader: () => getAdminDashboard(),
  component: AdminDashboard,
})

function AdminDashboard() {
  const stats = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <SectionCards
        teamCount={stats.teamCount}
        eventCount={stats.eventCount}
        postedMatchCount={stats.postedMatchCount}
        scoreEventCount={stats.scoreEventCount}
      />
      <MatchPointsChart data={stats.recentMatches} />
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            Every event with its roster and match progress
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Teams</TableHead>
                <TableHead className="text-right">Matches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No events yet —{" "}
                    <Link to="/admin/events" className="underline">
                      create one
                    </Link>
                    .
                  </TableCell>
                </TableRow>
              )}
              {stats.events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <Link
                      to="/admin/events/$eventId"
                      params={{ eventId: event.id }}
                      className="font-medium hover:underline"
                    >
                      {event.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        event.status === "complete" ? "secondary" : "default"
                      }
                    >
                      {event.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {event.teamCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {event.matchCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
