import { useState } from "react"
import { Loader2Icon } from "lucide-react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
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
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getGame } from "@/games"
import { listEventTeams } from "@/server/functions/events"
import { listMatches, regenerateQualSchedule } from "@/server/functions/matches"
import {
  listScoreEvents,
  postMatch,
  recordScoreEvent,
  undoScoreEvent,
} from "@/server/functions/scoring"

export const Route = createFileRoute("/admin/events/$eventSlug/matches")({
  loader: async ({ context }) => {
    const [matches, roster] = await Promise.all([
      listMatches({ data: { eventId: context.event.id } }),
      listEventTeams({ data: { eventId: context.event.id } }),
    ])
    return { event: context.event, matches, roster }
  },
  component: MatchesPage,
})

type MatchRow = Awaited<ReturnType<typeof listMatches>>[number]

function MatchesPage() {
  const { event, matches, roster } = Route.useLoaderData()
  const router = useRouter()
  const regenerateFn = useServerFn(regenerateQualSchedule)
  const [scoring, setScoring] = useState<MatchRow | null>(null)
  const [generating, setGenerating] = useState(false)
  const [pendingRounds, setPendingRounds] = useState<number | null>(null)

  async function runRegenerate(rounds: number) {
    setGenerating(true)
    try {
      await regenerateFn({ data: { eventId: event.id, roundsPerTeam: rounds } })
      await router.invalidate()
    } catch (error) {
      toast.error(String(error))
    } finally {
      setGenerating(false)
    }
  }

  const numbers = new Map(roster.map((t) => [t.teamId, t.number]))
  const label = (teamId: string | null) =>
    teamId ? `${numbers.get(teamId) ?? "?"}` : "—"

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {event.status === "setup" && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const rounds = Number(new FormData(e.currentTarget).get("rounds"))
            if (matches.length > 0) {
              setPendingRounds(rounds)
            } else {
              void runRegenerate(rounds)
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rounds">Rounds per team</Label>
            <Input
              id="rounds"
              name="rounds"
              type="number"
              min={1}
              max={12}
              defaultValue={3}
              className="w-24"
            />
          </div>
          <Button type="submit">
            {matches.length > 0 ? "Regenerate schedule" : "Generate schedule"}
          </Button>
        </form>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Match</TableHead>
            <TableHead className="text-[var(--alliance-red,#dc2626)]">
              Red
            </TableHead>
            <TableHead className="text-[var(--alliance-blue,#2563eb)]">
              Blue
            </TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {matches.map((match) => (
            <TableRow key={match.id}>
              <TableCell>
                {match.type === "qualification" ? "Q" : "P"}
                {match.number}
              </TableCell>
              <TableCell>
                {[match.red1, match.red2, match.red3].map(label).join(" · ")}
                {match.surrogates.length > 0 && " *"}
              </TableCell>
              <TableCell>
                {[match.blue1, match.blue2, match.blue3].map(label).join(" · ")}
              </TableCell>
              <TableCell className="font-mono">
                {match.redPoints !== null
                  ? `${match.redPoints}–${match.bluePoints}`
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge
                  variant={match.status === "posted" ? "default" : "outline"}
                >
                  {match.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setScoring(match)}
                >
                  Score
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {scoring && (
        <ScoreDialog
          match={scoring}
          gameId={event.gameId}
          label={label}
          onClose={async () => {
            setScoring(null)
            await router.invalidate()
          }}
        />
      )}

      <AlertDialog
        open={pendingRounds !== null}
        onOpenChange={(open) => !open && setPendingRounds(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all {matches.length} existing match
              {matches.length !== 1 ? "es" : ""} and build a new schedule from
              scratch. Any recorded scores will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const rounds = pendingRounds!
                setPendingRounds(null)
                void runRegenerate(rounds)
              }}
            >
              Delete and regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={generating}>
        <DialogContent
          className="max-w-xs text-center"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          showCloseButton={false}
        >
          <DialogHeader className="items-center">
            <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
            <DialogTitle>Generating schedule</DialogTitle>
            <DialogDescription>
              Building a balanced match schedule — this may take a moment.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ScoreDialog({
  match,
  gameId,
  label,
  onClose,
}: {
  match: MatchRow
  gameId: string
  label: (teamId: string | null) => string
  onClose: () => void
}) {
  const game = getGame(gameId)
  const recordFn = useServerFn(recordScoreEvent)
  const undoFn = useServerFn(undoScoreEvent)
  const postFn = useServerFn(postMatch)
  const [log, setLog] = useState<
    Array<{ id: string; alliance: string; type: string }>
  >([])
  const [points, setPoints] = useState<{
    red: number | null
    blue: number | null
  }>({
    red: match.redPoints,
    blue: match.bluePoints,
  })

  async function refresh() {
    const events = await listScoreEvents({ data: { matchId: match.id } })
    setLog(
      events
        .filter((e) => !e.undone)
        .map((e) => ({ id: e.id, alliance: e.alliance, type: e.type }))
    )
  }

  async function record(
    alliance: "red" | "blue",
    type: string,
    payload: Record<string, unknown> = {}
  ) {
    try {
      await recordFn({ data: { matchId: match.id, alliance, type, payload } })
      const matches = await listMatches({ data: { eventId: match.eventId } })
      const updated = matches.find((m) => m.id === match.id)
      setPoints({
        red: updated?.redPoints ?? null,
        blue: updated?.bluePoints ?? null,
      })
      await refresh()
    } catch (error) {
      toast.error(String(error))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Score {match.type === "qualification" ? "Q" : "P"}
            {match.number} —{" "}
            <span className="font-mono">
              {points.red ?? 0}–{points.blue ?? 0}
            </span>
          </DialogTitle>
          <DialogDescription>
            Manual score entry. Events recompute totals immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {(["red", "blue"] as const).map((alliance) => (
            <div key={alliance} className="flex flex-col gap-2">
              <h3
                className={`text-xs font-medium ${alliance === "red" ? "text-red-600" : "text-blue-600"}`}
              >
                {alliance.toUpperCase()} —{" "}
                {(alliance === "red"
                  ? [match.red1, match.red2, match.red3]
                  : [match.blue1, match.blue2, match.blue3]
                )
                  .map(label)
                  .join(" · ")}
              </h3>
              <div className="flex flex-wrap gap-1">
                {Object.entries(game.scoreEventTypes).map(([type, def]) => {
                  if (def.target === "robot") {
                    return [0, 1, 2].map((robotIndex) => (
                      <Button
                        key={`${type}-${robotIndex}`}
                        variant="outline"
                        size="xs"
                        onClick={() => record(alliance, type, { robotIndex })}
                      >
                        {def.label} R{robotIndex + 1}
                      </Button>
                    ))
                  }
                  if (def.target === "defense") {
                    return [0, 1, 2, 3, 4].map((defenseIndex) => (
                      <Button
                        key={`${type}-${defenseIndex}`}
                        variant="outline"
                        size="xs"
                        onClick={() => record(alliance, type, { defenseIndex })}
                      >
                        {def.label} D{defenseIndex + 1}
                      </Button>
                    ))
                  }
                  return (
                    <Button
                      key={type}
                      variant="outline"
                      size="xs"
                      onClick={() => record(alliance, type)}
                    >
                      {def.label}
                    </Button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium">Recorded events</h3>
          <ScrollArea className="h-32">
            <ul className="flex flex-col gap-1 text-xs">
              {log.length === 0 && (
                <li className="text-muted-foreground">
                  None yet — record or refresh.
                </li>
              )}
              {log.map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  <span className="font-mono">
                    [{e.alliance}] {e.type}
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={async () => {
                      await undoFn({ data: { scoreEventId: e.id } })
                      const matches = await listMatches({
                        data: { eventId: match.eventId },
                      })
                      const updated = matches.find((m) => m.id === match.id)
                      setPoints({
                        red: updated?.redPoints ?? null,
                        blue: updated?.bluePoints ?? null,
                      })
                      await refresh()
                    }}
                  >
                    undo
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={refresh}>
              Refresh log
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await postFn({ data: { matchId: match.id } })
                toast.success("Match posted")
                onClose()
              }}
            >
              Post match
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
