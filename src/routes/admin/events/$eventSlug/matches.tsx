import { useState } from "react"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import {
  createCustomMatch,
  deleteMatch,
  generateMoreQualMatches,
  listMatches,
  regenerateQualSchedule,
} from "@/server/functions/matches"
import {
  listScoreEvents,
  postMatch,
  recordScoreEvent,
  undoScoreEvent,
} from "@/server/functions/scoring"
import { ALLIANCE_ORDER } from "@/shared/alliance"
import { matchShortLabel } from "@/shared/match-format"

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
  const generateMoreFn = useServerFn(generateMoreQualMatches)
  const deleteFn = useServerFn(deleteMatch)
  const [scoring, setScoring] = useState<MatchRow | null>(null)
  const [generating, setGenerating] = useState(false)
  const [pendingRounds, setPendingRounds] = useState<number | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<MatchRow | null>(null)

  const canEdit = event.status === "setup" || event.status === "quals"

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

  async function runGenerateMore(rounds: number) {
    setGenerating(true)
    try {
      await generateMoreFn({
        data: { eventId: event.id, additionalRounds: rounds },
      })
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
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const rounds = Number(new FormData(e.currentTarget).get("rounds"))
              if (!rounds) return
              void runGenerateMore(rounds)
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
            <Button
              type="submit"
              variant={matches.length > 0 ? "outline" : "default"}
            >
              {matches.length > 0 ? "Generate more" : "Generate schedule"}
            </Button>
          </form>

          <Button variant="outline" onClick={() => setCustomOpen(true)}>
            <PlusIcon />
            Add custom match
          </Button>

          {event.status === "setup" && matches.length > 0 && (
            <Button
              variant="destructive"
              onClick={() => {
                const input = document.getElementById(
                  "rounds"
                ) as HTMLInputElement | null
                setPendingRounds(Number(input?.value) || 3)
              }}
            >
              Regenerate
            </Button>
          )}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Match</TableHead>
            {ALLIANCE_ORDER.map((side) => (
              <TableHead
                key={side}
                className="capitalize"
                style={{ color: `var(--alliance-${side})` }}
              >
                {side}
              </TableHead>
            ))}
            <TableHead>Score</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {matches.map((match) => (
            <TableRow key={match.id}>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-medium">{matchShortLabel(match)}</span>
                  {match.type === "practice" && (
                    <Badge variant="secondary" className="text-[0.65rem]">
                      practice
                    </Badge>
                  )}
                </span>
              </TableCell>
              {ALLIANCE_ORDER.map((side) => (
                <TableCell key={side}>
                  {(side === "red"
                    ? [match.red1, match.red2, match.red3]
                    : [match.blue1, match.blue2, match.blue3]
                  )
                    .map(label)
                    .join(" · ")}
                  {side === "red" && match.surrogates.length > 0 && " *"}
                </TableCell>
              ))}
              <TableCell className="font-mono">
                {match.redPoints !== null
                  ? `${ALLIANCE_ORDER.map((s) =>
                      s === "red" ? match.redPoints : match.bluePoints
                    ).join("–")}`
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
                <div className="flex justify-end gap-1">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setScoring(match)}
                  >
                    Score
                  </Button>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="xs"
                      title="Delete match"
                      disabled={match.status === "running"}
                      onClick={() => setPendingDelete(match)}
                    >
                      <Trash2Icon className="text-destructive" />
                    </Button>
                  )}
                </div>
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

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete ? matchShortLabel(pendingDelete) : "match"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the match and any recorded scores. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const match = pendingDelete!
                setPendingDelete(null)
                try {
                  await deleteFn({
                    data: { eventId: event.id, matchId: match.id },
                  })
                  await router.invalidate()
                } catch (error) {
                  toast.error(String(error))
                }
              }}
            >
              Delete match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomMatchDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        eventId={event.id}
        roster={roster}
        onCreated={async () => {
          setCustomOpen(false)
          await router.invalidate()
        }}
      />
    </div>
  )
}

function CustomMatchDialog({
  open,
  onOpenChange,
  eventId,
  roster,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  roster: Awaited<ReturnType<typeof listEventTeams>>
  onCreated: () => void
}) {
  const createFn = useServerFn(createCustomMatch)
  const [matchType, setMatchType] = useState<"qualification" | "practice">(
    "practice"
  )
  const [red, setRed] = useState<(string | null)[]>([null, null, null])
  const [blue, setBlue] = useState<(string | null)[]>([null, null, null])
  const [saving, setSaving] = useState(false)

  const chosen = new Set([...red, ...blue].filter(Boolean) as string[])

  function slot(
    side: "red" | "blue",
    index: number,
    value: string | null,
    set: (next: (string | null)[]) => void,
    current: (string | null)[]
  ) {
    return (
      <Select
        value={value ?? "none"}
        onValueChange={(v) => {
          const next = [...current]
          next[index] = v === "none" ? null : v
          set(next)
        }}
      >
        <SelectTrigger
          className="w-full"
          style={{
            borderColor:
              side === "red" ? "var(--alliance-red)" : "var(--alliance-blue)",
          }}
        >
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— empty —</SelectItem>
          {roster.map((t) => (
            <SelectItem
              key={t.teamId}
              value={t.teamId}
              disabled={chosen.has(t.teamId) && value !== t.teamId}
            >
              {t.number} {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add custom match</DialogTitle>
          <DialogDescription>
            Pick the alliances. Practice matches never count toward rankings or
            team statistics.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label>Match type</Label>
          <Select
            value={matchType}
            onValueChange={(v) =>
              setMatchType(v as "qualification" | "practice")
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="practice">Practice (unranked)</SelectItem>
              <SelectItem value="qualification">Qualification</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {ALLIANCE_ORDER.map((side) => {
            const value = side === "red" ? red : blue
            const set = side === "red" ? setRed : setBlue
            return (
              <div key={side} className="flex flex-col gap-2">
                <span
                  className="text-xs font-bold tracking-wide capitalize uppercase"
                  style={{ color: `var(--alliance-${side})` }}
                >
                  {side}
                </span>
                {[0, 1, 2].map((i) => (
                  <div key={i}>{slot(side, i, value[i], set, value)}</div>
                ))}
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button
            disabled={saving || chosen.size === 0}
            onClick={async () => {
              setSaving(true)
              try {
                await createFn({
                  data: {
                    eventId,
                    matchType,
                    red: [red[0] ?? null, red[1] ?? null, red[2] ?? null],
                    blue: [blue[0] ?? null, blue[1] ?? null, blue[2] ?? null],
                  },
                })
                setRed([null, null, null])
                setBlue([null, null, null])
                toast.success("Match added")
                onCreated()
              } catch (error) {
                toast.error(String(error))
              } finally {
                setSaving(false)
              }
            }}
          >
            Add match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
            Score {matchShortLabel(match)} —{" "}
            <span className="font-mono">
              {points.red ?? 0}–{points.blue ?? 0}
            </span>
          </DialogTitle>
          <DialogDescription>
            Manual score entry. Events recompute totals immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {ALLIANCE_ORDER.map((alliance) => (
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
