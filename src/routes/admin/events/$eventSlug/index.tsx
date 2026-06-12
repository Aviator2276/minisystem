import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { EventStatus } from "@/db/schema"
import {
  advanceStatus,
  attachTeams,
  detachTeam,
  importRoster,
  listEventTeams,
  listEvents,
} from "@/server/functions/events"
import { listMatches } from "@/server/functions/matches"
import { listTeams } from "@/server/functions/teams"
import {
  ArrowRightIcon,
  ListChecksIcon,
  PlayIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"

const STATUS_STEPS: EventStatus[] = [
  "setup",
  "quals",
  "alliance_selection",
  "playoffs",
  "complete",
]

export const Route = createFileRoute("/admin/events/$eventSlug/")({
  loader: async ({ context }) => {
    const [roster, matches, allTeams, allEvents] = await Promise.all([
      listEventTeams({ data: { eventId: context.event.id } }),
      listMatches({ data: { eventId: context.event.id } }),
      listTeams(),
      listEvents(),
    ])
    return { roster, matches, allTeams, allEvents }
  },
  component: EventDashboard,
})

function EventDashboard() {
  const { event } = Route.useRouteContext()
  const { eventSlug } = Route.useParams()
  const { roster, matches, allTeams, allEvents } = Route.useLoaderData()
  const router = useRouter()
  const advanceFn = useServerFn(advanceStatus)
  const detachFn = useServerFn(detachTeam)

  const posted = matches.filter((m) => m.status === "posted").length
  const stepIndex = STATUS_STEPS.indexOf(event.status)
  const next = STATUS_STEPS[stepIndex + 1] as EventStatus | undefined

  return (
    <div className="grid gap-4 @xl/main:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild variant="outline" className="justify-start">
            <Link to="/admin/events/$eventSlug/matches" params={{ eventSlug }}>
              <ListChecksIcon />
              Schedule & scores
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link to="/admin/events/$eventSlug/control" params={{ eventSlug }}>
              <PlayIcon />
              Field control
            </Link>
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            onClick={() =>
              window.open(
                `/display/${eventSlug}`,
                "display",
                "popup=1,width=1280,height=720"
              )
            }
          >
            <ArrowRightIcon />
            Open display screen
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link to="/judge/$eventSlug" params={{ eventSlug }} target="_blank">
              <ArrowRightIcon />
              Open judge scorer
            </Link>
          </Button>
        </CardContent>
      </Card>
      <Card className="bg-gradient-to-t from-primary/5 to-card shadow-xs">
        <CardHeader>
          <CardDescription>Matches</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums">
            {posted}
            <span className="text-base font-normal text-muted-foreground">
              {" "}
              / {matches.length} posted
            </span>
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <ListChecksIcon />
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="w-full">
          <Progress
            value={matches.length === 0 ? 0 : (posted / matches.length) * 100}
          />
        </CardFooter>
      </Card>
      <Card className="bg-gradient-to-t from-primary/5 to-card shadow-xs">
        <CardHeader>
          <CardDescription>Stage</CardDescription>
          <CardTitle className="text-3xl font-semibold capitalize">
            {event.status.replace("_", " ")}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <PlayIcon />
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex w-full items-center gap-3">
          <Progress
            value={(stepIndex / (STATUS_STEPS.length - 1)) * 100}
            className="flex-1"
          />
          {next && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline">
                  {next.replace("_", " ")}
                  <ArrowRightIcon />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="capitalize">
                    Advance to {next.replace("_", " ")}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This moves the event from{" "}
                    <span className="font-medium text-foreground capitalize">
                      {event.status.replace("_", " ")}
                    </span>{" "}
                    to{" "}
                    <span className="font-medium text-foreground capitalize">
                      {next.replace("_", " ")}
                    </span>
                    . Event stages only move forward — this cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        await advanceFn({
                          data: { eventId: event.id, to: next },
                        })
                        await router.invalidate()
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : String(error)
                        )
                      }
                    }}
                  >
                    Advance
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardFooter>
      </Card>

      <Card className="@xl/main:col-span-2">
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>
            Teams registered for {event.name}
            {event.status !== "setup" && " — locked after setup"}
          </CardDescription>
          <CardAction>
            {event.status === "setup" && (
              <ManageRosterDialog
                eventId={event.id}
                rosterTeamIds={roster.map((t) => t.teamId)}
                allTeams={allTeams}
                sourceEvents={allEvents.filter((e) => e.id !== event.id)}
              />
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 @md/main:grid-cols-3 @2xl/main:grid-cols-4">
          {roster.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">
              No teams yet — add them from the roster manager.
            </p>
          )}
          {roster.map((team) => (
            <div
              key={team.id}
              className="flex items-center gap-2 border border-border bg-secondary/40 px-3 py-2 text-sm"
            >
              <span className="font-mono font-bold tabular-nums">
                {team.number}
              </span>
              <span className="truncate">{team.name}</span>
              {event.status === "setup" && (
                <button
                  type="button"
                  title={`Remove ${team.name}`}
                  className="ml-auto shrink-0 opacity-50 hover:opacity-100"
                  onClick={async () => {
                    await detachFn({
                      data: { eventId: event.id, teamId: team.teamId },
                    })
                    await router.invalidate()
                  }}
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function ManageRosterDialog({
  eventId,
  rosterTeamIds,
  allTeams,
  sourceEvents,
}: {
  eventId: string
  rosterTeamIds: string[]
  allTeams: Awaited<ReturnType<typeof listTeams>>
  sourceEvents: { id: string; name: string }[]
}) {
  const router = useRouter()
  const attachFn = useServerFn(attachTeams)
  const importFn = useServerFn(importRoster)
  const [importSource, setImportSource] = useState("")

  const inRoster = new Set(rosterTeamIds)
  const available = allTeams.filter((t) => !inRoster.has(t.id))

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PlusIcon />
          Manage roster
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage roster</DialogTitle>
          <DialogDescription>
            Add registered teams one by one, all at once, or import a previous
            event's roster.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-56">
          <div className="flex flex-wrap content-start gap-1.5">
            {available.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Every registered team is attached.
              </p>
            )}
            {available.map((team) => (
              <Button
                key={team.id}
                size="sm"
                variant="outline"
                onClick={async () => {
                  await attachFn({ data: { eventId, teamIds: [team.id] } })
                  await router.invalidate()
                }}
              >
                <PlusIcon /> {team.number} {team.name}
              </Button>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2">
          <Select value={importSource} onValueChange={setImportSource}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Import roster from…" />
            </SelectTrigger>
            <SelectContent>
              {sourceEvents.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {source.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            disabled={importSource === ""}
            onClick={async () => {
              const added = await importFn({
                data: { eventId, sourceEventId: importSource },
              })
              toast.success(`Imported ${added} teams`)
              await router.invalidate()
            }}
          >
            Import
          </Button>
        </div>

        <DialogFooter>
          <Button
            disabled={available.length === 0}
            onClick={async () => {
              await attachFn({
                data: { eventId, teamIds: available.map((t) => t.id) },
              })
              await router.invalidate()
            }}
          >
            Add all {available.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
