import { useEffect, useState } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getGame } from "@/games"
import { useRealtime } from "@/hooks/use-realtime"
import { useServerClock } from "@/hooks/use-server-clock"
import type { FieldState } from "@/server/engine/match-engine"
import { getCurrentUser } from "@/server/functions/auth"
import { getEventBySlug } from "@/server/functions/events"
import { getFieldState } from "@/server/functions/field-control"
import { listMatches } from "@/server/functions/matches"
import { recordScoreEvent, undoScoreEvent } from "@/server/functions/scoring"
import { topicFor } from "@/shared/realtime-messages"
import type { ServerMessage } from "@/shared/realtime-messages"
import { Undo2Icon } from "lucide-react"

export const Route = createFileRoute("/judge/$eventSlug")({
  beforeLoad: async ({ params }) => {
    const user = await getCurrentUser()
    if (!user) throw redirect({ to: "/login" })
    return { event: await getEventBySlug({ data: { slug: params.eventSlug } }) }
  },
  loader: async ({ context }) => {
    const [field, matches] = await Promise.all([
      getFieldState({ data: { eventId: context.event.id } }),
      listMatches({ data: { eventId: context.event.id } }),
    ])
    return { field, matches }
  },
  component: JudgePage,
})

type Alliance = "red" | "blue"
type Totals = Extract<ServerMessage, { type: "score_update" }>["red"]

const PHASE_LABELS: Record<string, string> = {
  no_entry: "Waiting",
  safe_to_enter: "Waiting",
  auto: "AUTO",
  pause: "GET READY",
  teleop: "TELEOP",
  endgame: "ENDGAME",
  post_match: "Match over",
  fault: "Field fault",
}

function JudgePage() {
  const { event } = Route.useRouteContext()
  const loaded = Route.useLoaderData()

  const [alliance, setAlliance] = useState<Alliance | null>(null)
  const [field, setField] = useState<FieldState>(loaded.field)
  const [matches, setMatches] = useState(loaded.matches)
  const [totals, setTotals] = useState<{ red: Totals; blue: Totals }>({
    red: null,
    blue: null,
  })
  const [undoStack, setUndoStack] = useState<string[]>([])

  const game = getGame(event.gameId)
  const current = matches.find((m) => m.id === field.matchId) ?? null

  useRealtime([topicFor(event.id, "judge")], (message) => {
    if (message.type === "match_state") {
      setField((prev) => ({
        ...prev,
        matchId: message.matchId,
        phase: message.phase,
        phaseEndsAt: message.phaseEndsAt,
        running: message.phaseEndsAt !== null,
      }))
    }
    if (message.type === "score_update") {
      setTotals({ red: message.red, blue: message.blue })
      setMatches((prev) =>
        prev.map((m) =>
          m.id === message.matchId
            ? { ...m, status: message.status as typeof m.status }
            : m
        )
      )
    }
  })

  // new match queued -> the undo stack belongs to the previous one
  useEffect(() => setUndoStack([]), [field.matchId])

  if (alliance === null) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            Which alliance are you scoring?
          </p>
        </div>
        <div className="grid w-full max-w-sm grid-cols-2 gap-4">
          <Button
            className="h-32 bg-[var(--alliance-red,#dc2626)] text-xl font-bold text-white hover:bg-[var(--alliance-red,#dc2626)]/90"
            onClick={() => setAlliance("red")}
          >
            RED
          </Button>
          <Button
            className="h-32 bg-[var(--alliance-blue,#2563eb)] text-xl font-bold text-white hover:bg-[var(--alliance-blue,#2563eb)]/90"
            onClick={() => setAlliance("blue")}
          >
            BLUE
          </Button>
        </div>
      </main>
    )
  }

  const allianceColor =
    alliance === "red"
      ? "var(--alliance-red, #dc2626)"
      : "var(--alliance-blue, #2563eb)"
  const myTotal = totals[alliance]?.total
  const teams = current
    ? (alliance === "red"
        ? [current.red1, current.red2, current.red3]
        : [current.blue1, current.blue2, current.blue3]
      ).filter(Boolean).length
    : 0

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-3 p-3 pb-8">
      <header
        className="sticky top-0 z-10 flex items-center gap-3 p-3 text-white"
        style={{ backgroundColor: allianceColor }}
      >
        <button
          type="button"
          className="text-left"
          onClick={() => setAlliance(null)}
          title="Switch alliance"
        >
          <div className="text-lg leading-none font-bold">
            {alliance.toUpperCase()}
          </div>
          <div className="text-[0.65rem] opacity-80">tap to switch</div>
        </button>
        <div className="ml-auto text-right">
          <div className="text-xs opacity-80">
            {current
              ? `${current.type === "qualification" ? "Q" : "P"}${current.number}`
              : "no match"}
            {teams > 0 && ` · ${teams} robots`}
          </div>
          <div className="flex items-center justify-end gap-2 font-mono text-xl font-bold tabular-nums">
            <span>{PHASE_LABELS[field.phase] ?? field.phase}</span>
            <Countdown phaseEndsAt={field.phaseEndsAt} />
          </div>
        </div>
      </header>

      {myTotal !== undefined && (
        <div className="text-center font-mono text-3xl font-bold tabular-nums">
          {myTotal}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            pts recorded
          </span>
        </div>
      )}

      {current === null ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Waiting for the field admin to queue a match…
        </p>
      ) : (
        <ScoringPad
          gameId={event.gameId}
          phases={game.phases.map((p) => p.id)}
          activePhase={field.phase}
          matchId={current.id}
          alliance={alliance}
          onRecorded={(id) => setUndoStack((prev) => [...prev, id])}
        />
      )}

      <UndoButton
        undoStack={undoStack}
        onUndone={() => setUndoStack((prev) => prev.slice(0, -1))}
      />
    </main>
  )
}

function Countdown({ phaseEndsAt }: { phaseEndsAt: number | null }) {
  const clock = useServerClock()
  const [, force] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (phaseEndsAt === null) return
    const interval = setInterval(() => force((n) => n + 1), 100)
    return () => clearInterval(interval)
  }, [phaseEndsAt])

  if (!mounted || phaseEndsAt === null) return null
  const seconds = Math.max(0, phaseEndsAt - clock.now()) / 1000
  return <span>{seconds < 10 ? seconds.toFixed(1) : Math.ceil(seconds)}</span>
}

function ScoringPad({
  gameId,
  phases,
  activePhase,
  matchId,
  alliance,
  onRecorded,
}: {
  gameId: string
  phases: string[]
  activePhase: string
  matchId: string
  alliance: Alliance
  onRecorded: (scoreEventId: string) => void
}) {
  const game = getGame(gameId)
  const recordFn = useServerFn(recordScoreEvent)
  const [busy, setBusy] = useState(false)

  async function record(type: string, payload: Record<string, unknown> = {}) {
    if (busy) return
    setBusy(true)
    if ("vibrate" in navigator) navigator.vibrate(30)
    try {
      const event = await recordFn({
        data: { matchId, alliance, type, payload },
      })
      onRecorded(event.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const entries = Object.entries(game.scoreEventTypes)
  const anytime = entries.filter(
    ([, def]) => def.phases.length >= phases.length
  )
  const sections = phases.map((phase) => ({
    phase,
    defs: entries.filter(
      ([, def]) => def.phases.length < phases.length && def.phases[0] === phase
    ),
  }))

  return (
    <div className="flex flex-col gap-3">
      {sections.map(({ phase, defs }) => (
        <Card
          key={phase}
          className={activePhase === phase ? "ring-2 ring-primary" : undefined}
        >
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm uppercase">
              {phase}
              {activePhase === phase && <Badge>now</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {defs.map(([type, def]) => (
              <ScoreButtons
                key={type}
                type={type}
                def={def}
                onRecord={record}
              />
            ))}
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm uppercase">Penalties</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {anytime.map(([type, def]) => (
            <ScoreButtons key={type} type={type} def={def} onRecord={record} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function ScoreButtons({
  type,
  def,
  onRecord,
}: {
  type: string
  def: { label: string; target?: string }
  onRecord: (type: string, payload?: Record<string, unknown>) => void
}) {
  if (def.target === "robot") {
    return (
      <div className="flex w-full gap-2">
        {[0, 1, 2].map((robotIndex) => (
          <Button
            key={robotIndex}
            variant="outline"
            className="h-14 flex-1"
            onClick={() => onRecord(type, { robotIndex })}
          >
            {def.label} R{robotIndex + 1}
          </Button>
        ))}
      </div>
    )
  }
  if (def.target === "defense") {
    return (
      <div className="flex w-full gap-1.5">
        {[0, 1, 2, 3, 4].map((defenseIndex) => (
          <Button
            key={defenseIndex}
            variant="outline"
            className="h-14 flex-1 px-1"
            onClick={() => onRecord(type, { defenseIndex })}
          >
            {def.label} D{defenseIndex + 1}
          </Button>
        ))}
      </div>
    )
  }
  return (
    <Button
      variant="outline"
      className="h-14 min-w-[45%] flex-1"
      onClick={() => onRecord(type)}
    >
      {def.label}
    </Button>
  )
}

function UndoButton({
  undoStack,
  onUndone,
}: {
  undoStack: string[]
  onUndone: () => void
}) {
  const undoFn = useServerFn(undoScoreEvent)
  const last = undoStack.at(-1)

  return (
    <Button
      variant="secondary"
      className="h-12"
      disabled={last === undefined}
      onClick={async () => {
        if (last === undefined) return
        try {
          await undoFn({ data: { scoreEventId: last } })
          onUndone()
          toast.success("Undone")
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error))
        }
      }}
    >
      <Undo2Icon />
      Undo last ({undoStack.length})
    </Button>
  )
}
