import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { EventStatus } from "@/db/schema"
import {
  advanceStatus,
  attachTeams,
  detachTeam,
  getEvent,
  importRoster,
  listEventTeams,
  listEvents,
} from "@/server/functions/events"
import { listTeams } from "@/server/functions/teams"

const NEXT_STATUS: Partial<Record<EventStatus, EventStatus>> = {
  setup: "quals",
  quals: "alliance_selection",
  alliance_selection: "playoffs",
  playoffs: "complete",
}

export const Route = createFileRoute("/admin/events/$eventId/")({
  loader: async ({ params }) => {
    const [event, roster, allTeams, allEvents] = await Promise.all([
      getEvent({ data: { eventId: params.eventId } }),
      listEventTeams({ data: { eventId: params.eventId } }),
      listTeams(),
      listEvents(),
    ])
    return { event, roster, allTeams, allEvents }
  },
  component: RosterPage,
})

function RosterPage() {
  const { event, roster, allTeams, allEvents } = Route.useLoaderData()
  const router = useRouter()
  const attachFn = useServerFn(attachTeams)
  const detachFn = useServerFn(detachTeam)
  const importFn = useServerFn(importRoster)
  const advanceFn = useServerFn(advanceStatus)

  const rosterIds = new Set(roster.map((t) => t.teamId))
  const available = allTeams.filter((t) => !rosterIds.has(t.id))
  const otherEvents = allEvents.filter((e) => e.id !== event.id)
  const next = NEXT_STATUS[event.status]

  return (
    <div className="flex max-w-4xl flex-col gap-4 md:flex-row">
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Roster ({roster.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((team) => (
                <TableRow key={team.id}>
                  <TableCell>{team.number}</TableCell>
                  <TableCell>{team.name}</TableCell>
                  <TableCell className="text-right">
                    {event.status === "setup" && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={async () => {
                          await detachFn({
                            data: { eventId: event.id, teamId: team.teamId },
                          })
                          await router.invalidate()
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex w-full flex-col gap-4 md:w-72">
        <Card>
          <CardHeader>
            <CardTitle>Add teams</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {available.length === 0 && (
              <p className="text-xs text-muted-foreground">
                All teams attached.
              </p>
            )}
            {available.slice(0, 12).map((team) => (
              <Button
                key={team.id}
                variant="outline"
                size="xs"
                className="justify-start"
                onClick={async () => {
                  await attachFn({
                    data: { eventId: event.id, teamIds: [team.id] },
                  })
                  await router.invalidate()
                }}
              >
                + {team.number} {team.name}
              </Button>
            ))}
            {available.length > 1 && (
              <Button
                size="xs"
                onClick={async () => {
                  await attachFn({
                    data: {
                      eventId: event.id,
                      teamIds: available.map((t) => t.id),
                    },
                  })
                  await router.invalidate()
                }}
              >
                Add all {available.length}
              </Button>
            )}
            {otherEvents.map((source) => (
              <Button
                key={source.id}
                variant="secondary"
                size="xs"
                onClick={async () => {
                  const added = await importFn({
                    data: { eventId: event.id, sourceEventId: source.id },
                  })
                  toast.success(`Imported ${added} teams from ${source.name}`)
                  await router.invalidate()
                }}
              >
                Import roster from {source.name}
              </Button>
            ))}
          </CardContent>
        </Card>

        {next && (
          <Card>
            <CardHeader>
              <CardTitle>Lifecycle</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={async () => {
                  try {
                    await advanceFn({ data: { eventId: event.id, to: next } })
                    await router.invalidate()
                  } catch (error) {
                    toast.error(String(error))
                  }
                }}
              >
                Advance to {next.replace("_", " ")}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
