import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRealtime } from "@/hooks/use-realtime"
import { useServerClock } from "@/hooks/use-server-clock"
import type { FieldState } from "@/server/engine/match-engine"
import {
  fieldFault,
  getFieldState,
  noEntry,
  playMatch,
  replayMatch,
  safeToEnter,
  setCurrentMatch,
} from "@/server/functions/field-control"
import { listMatches } from "@/server/functions/matches"
import type { CachedAllianceScore } from "@/server/services/scoring"
import { topicFor } from "@/shared/realtime-messages"
import type { ServerMessage } from "@/shared/realtime-messages"

export const Route = createFileRoute("/admin/events/$eventId/control")({
  loader: async ({ params }) => {
    const [field, matches] = await Promise.all([
      getFieldState({ data: { eventId: params.eventId } }),
      listMatches({ data: { eventId: params.eventId } }),
    ])
    return { field, matches }
  },
  component: ControlPanel,
})

type Totals = Extract<ServerMessage, { type: "score_update" }>["red"]

const PHASE_LABELS: Record<string, string> = {
  no_entry: "Do not enter",
  safe_to_enter: "Safe to enter",
  auto: "Autonomous",
  teleop: "Teleop",
  endgame: "Endgame",
  post_match: "Match over",
  fault: "Field fault",
}

const PHASE_STYLES: Record<string, string> = {
  no_entry: "bg-muted text-muted-foreground",
  safe_to_enter: "bg-emerald-600 text-white",
  auto: "bg-amber-500 text-white",
  teleop: "bg-emerald-600 text-white",
  endgame: "bg-yellow-500 text-black",
  post_match: "bg-muted text-muted-foreground",
  fault: "bg-destructive text-white",
}

function matchLabel(match: { type: string; number: number }) {
  return `${match.type === "qualification" ? "Q" : "P"}${match.number}`
}

function ControlPanel() {
  const { eventId } = Route.useParams()
  const loaded = Route.useLoaderData()

  const [field, setField] = useState<FieldState>(loaded.field)
  const [matches, setMatches] = useState(loaded.matches)

  const current = matches.find((m) => m.id === field.matchId) ?? null
  const [totals, setTotals] = useState<{ red: Totals; blue: Totals }>({
    red: (current?.redScore as CachedAllianceScore | null)?.totals ?? null,
    blue: (current?.blueScore as CachedAllianceScore | null)?.totals ?? null,
  })

  // re-seed the points panel from the cached aggregates when the queue changes
  useEffect(() => {
    setTotals({
      red: (current?.redScore as CachedAllianceScore | null)?.totals ?? null,
      blue: (current?.blueScore as CachedAllianceScore | null)?.totals ?? null,
    })
  }, [field.matchId])

  useRealtime([topicFor(eventId, "control")], (message) => {
    if (message.type === "match_state") {
      setField((prev) => ({
        ...prev,
        matchId: message.matchId,
        phase: message.phase,
        phaseEndsAt: message.phaseEndsAt,
        running: message.phaseEndsAt !== null,
      }))
      if (message.phase === "no_entry" && message.matchId !== field.matchId) {
        setTotals({ red: null, blue: null })
      }
    }
    if (message.type === "score_update") {
      setTotals({ red: message.red, blue: message.blue })
      setMatches((prev) =>
        prev.map((m) =>
          m.id === message.matchId
            ? {
                ...m,
                status: message.status as typeof m.status,
                redPoints: message.red?.total ?? null,
                bluePoints: message.blue?.total ?? null,
              }
            : m
        )
      )
    }
    if (message.type === "toast") {
      const show = message.variant === "warning" ? toast.warning : toast.info
      show(message.message)
    }
  })

  const setMatchFn = useServerFn(setCurrentMatch)
  const noEntryFn = useServerFn(noEntry)
  const safeFn = useServerFn(safeToEnter)
  const playFn = useServerFn(playMatch)
  const faultFn = useServerFn(fieldFault)
  const replayFn = useServerFn(replayMatch)

  async function run(action: () => Promise<FieldState>) {
    try {
      setField(await action())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const canReplay =
    !field.running &&
    current !== null &&
    (current.status === "scored" || field.phase === "fault")

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Field</CardTitle>
            <CardDescription>Server-authoritative match state</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Badge className={PHASE_STYLES[field.phase] ?? ""}>
                {PHASE_LABELS[field.phase] ?? field.phase}
              </Badge>
              <PhaseCountdown phaseEndsAt={field.phaseEndsAt} />
            </div>
            <div className="text-sm text-muted-foreground">
              {current ? (
                <>
                  Queued:{" "}
                  <span className="font-medium text-foreground">
                    {matchLabel(current)}
                  </span>{" "}
                  <Badge variant="outline">{current.status}</Badge>
                </>
              ) : (
                "No match queued"
              )}
            </div>
            <Select
              value={field.matchId ?? ""}
              onValueChange={(matchId) =>
                run(() => setMatchFn({ data: { eventId, matchId } }))
              }
              disabled={field.running}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Queue a match…" />
              </SelectTrigger>
              <SelectContent>
                {matches.map((match) => (
                  <SelectItem key={match.id} value={match.id}>
                    {matchLabel(match)} — {match.status}
                    {match.redPoints !== null
                      ? ` (${match.redPoints}–${match.bluePoints})`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Phase controls</CardTitle>
            <CardDescription>
              Drives the display screen and judge devices for everyone watching
              this event
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={field.running}
              onClick={() => run(() => noEntryFn({ data: { eventId } }))}
            >
              Do not enter
            </Button>
            <Button
              variant="outline"
              disabled={field.running}
              onClick={() => run(() => safeFn({ data: { eventId } }))}
            >
              Safe to enter
            </Button>
            <Button
              disabled={
                field.running || !current || current.status !== "scheduled"
              }
              onClick={() => run(() => playFn({ data: { eventId } }))}
            >
              Play match
            </Button>
            <Button
              variant="destructive"
              disabled={!field.running}
              onClick={() => run(() => faultFn({ data: { eventId } }))}
            >
              Field fault
            </Button>
            <Button
              variant="secondary"
              disabled={!canReplay}
              onClick={() => run(() => replayFn({ data: { eventId } }))}
            >
              Replay match
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AlliancePoints
          alliance="red"
          teams={current ? [current.red1, current.red2, current.red3] : []}
          totals={totals.red}
        />
        <AlliancePoints
          alliance="blue"
          teams={current ? [current.blue1, current.blue2, current.blue3] : []}
          totals={totals.blue}
        />
      </div>
    </div>
  )
}

function PhaseCountdown({ phaseEndsAt }: { phaseEndsAt: number | null }) {
  const clock = useServerClock()
  const [, force] = useState(0)
  // render nothing until mounted: the countdown depends on the live clock, so
  // an SSR'd value is stale by hydration time and trips a hydration mismatch
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (phaseEndsAt === null) return
    const interval = setInterval(() => force((n) => n + 1), 100)
    return () => clearInterval(interval)
  }, [phaseEndsAt])

  if (!mounted || phaseEndsAt === null) return null
  const remainingMs = Math.max(0, phaseEndsAt - clock.now())
  const seconds = remainingMs / 1000
  return (
    <span className="font-mono text-2xl font-semibold tabular-nums">
      {seconds < 10 ? seconds.toFixed(1) : Math.ceil(seconds)}s
    </span>
  )
}

const TOTAL_ROWS = [
  ["auto", "Auto"],
  ["teleop", "Teleop"],
  ["endgame", "Endgame"],
  ["penalty", "Opponent penalties"],
  ["bonus", "Bonus"],
] as const

function AlliancePoints({
  alliance,
  teams,
  totals,
}: {
  alliance: "red" | "blue"
  teams: (string | null)[]
  totals: Totals
}) {
  const color =
    alliance === "red"
      ? "text-[var(--alliance-red,#dc2626)]"
      : "text-[var(--alliance-blue,#2563eb)]"

  return (
    <Card>
      <CardHeader>
        <CardTitle className={color}>{alliance.toUpperCase()}</CardTitle>
        <CardDescription>
          Live recorded points — read-only
          {teams.filter(Boolean).length > 0
            ? ` · ${teams.filter(Boolean).length} teams`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {totals === null ? (
          <p className="text-sm text-muted-foreground">
            No scores recorded yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div
              className={`font-mono text-4xl font-bold tabular-nums ${color}`}
            >
              {totals.total}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {TOTAL_ROWS.map(([key, label]) => (
                <div key={key} className="flex justify-between">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-mono tabular-nums">{totals[key]}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Boulders</dt>
                <dd className="font-mono tabular-nums">{totals.boulders}</dd>
              </div>
            </dl>
            <div className="flex gap-2">
              {totals.breach && <Badge variant="secondary">Breach</Badge>}
              {totals.capture && <Badge variant="secondary">Capture</Badge>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
