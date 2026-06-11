import { useEffect, useState } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { getGame } from "@/games"
import { DEFENSE_STRENGTH, DEFENSES, PointValues } from "@/games/stronghold"
import type { StrongholdScore } from "@/games/stronghold"
import { useRealtime } from "@/hooks/use-realtime"
import { useServerClock } from "@/hooks/use-server-clock"
import type { FieldState } from "@/server/engine/match-engine"
import { getCurrentUser } from "@/server/functions/auth"
import { getEventBySlug } from "@/server/functions/events"
import { getFieldState } from "@/server/functions/field-control"
import { listMatches } from "@/server/functions/matches"
import { recordScoreEvent, undoScoreEvent } from "@/server/functions/scoring"
import {
  judgeCheckIn,
  judgeHeartbeat,
  judgeLeave,
  judgeResume,
  judgeSubmit,
} from "@/server/functions/judges"
import type { CachedAllianceScore } from "@/server/services/scoring"
import { allianceOrder } from "@/shared/alliance"
import { matchShortLabel } from "@/shared/match-format"
import { topicFor } from "@/shared/realtime-messages"
import type { ServerMessage } from "@/shared/realtime-messages"
import { CheckCircle2Icon, SendIcon, Undo2Icon } from "lucide-react"

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
type MatchRow = Awaited<ReturnType<typeof listMatches>>[number]

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

function cachedState(
  cache: unknown,
  fallback: StrongholdScore
): StrongholdScore {
  return (cache as CachedAllianceScore | null)?.state
    ? ((cache as CachedAllianceScore).state as StrongholdScore)
    : fallback
}

function JudgePage() {
  const { event } = Route.useRouteContext()
  const loaded = Route.useLoaderData()
  const game = getGame(event.gameId)
  const fresh = () => game.initialScore() as StrongholdScore

  const [alliance, setAlliance] = useState<Alliance | null>(null)
  const [field, setField] = useState<FieldState>(loaded.field)
  const [matches, setMatches] = useState(loaded.matches)
  const initial = loaded.matches.find((m) => m.id === loaded.field.matchId)
  const [states, setStates] = useState<{
    red: StrongholdScore
    blue: StrongholdScore
  }>(() => ({
    red: cachedState(initial?.redScore, fresh()),
    blue: cachedState(initial?.blueScore, fresh()),
  }))
  const [totals, setTotals] = useState<{ red: Totals; blue: Totals }>({
    red: (initial?.redScore as CachedAllianceScore | null)?.totals ?? null,
    blue: (initial?.blueScore as CachedAllianceScore | null)?.totals ?? null,
  })
  const [undoStack, setUndoStack] = useState<{ id: string; label: string }[]>(
    []
  )
  const [judgeId] = useState(() => crypto.randomUUID())
  const [submittedMatchId, setSubmittedMatchId] = useState<string | null>(null)
  const [flipSides, setFlipSides] = useState(
    event.settings.flipAllianceSides ?? false
  )

  const checkInFn = useServerFn(judgeCheckIn)
  const heartbeatFn = useServerFn(judgeHeartbeat)
  const submitFn = useServerFn(judgeSubmit)
  const resumeFn = useServerFn(judgeResume)
  const leaveFn = useServerFn(judgeLeave)

  const current = matches.find((m) => m.id === field.matchId) ?? null

  // presence: a judge counts as active once it picks an alliance, and stays
  // active while it heartbeats; closing the page (cleanup) drops it
  useEffect(() => {
    if (alliance === null) return
    void checkInFn({ data: { eventId: event.id, judgeId, alliance } })
    const interval = setInterval(() => {
      void heartbeatFn({ data: { eventId: event.id, judgeId } })
    }, 5000)
    return () => {
      clearInterval(interval)
      void leaveFn({ data: { eventId: event.id, judgeId } })
    }
  }, [alliance])

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
      setStates({
        red: (message.redState as StrongholdScore | null) ?? fresh(),
        blue: (message.blueState as StrongholdScore | null) ?? fresh(),
      })
      setMatches((prev) =>
        prev.map((m) =>
          m.id === message.matchId
            ? { ...m, status: message.status as typeof m.status }
            : m
        )
      )
    }
    if (message.type === "settings_update") {
      setFlipSides(message.flipAllianceSides)
    }
  })

  // a newly queued match resets local scoring context
  useEffect(() => {
    const c = matches.find((m) => m.id === field.matchId)
    setStates({
      red: cachedState(c?.redScore, fresh()),
      blue: cachedState(c?.blueScore, fresh()),
    })
    setTotals({
      red: (c?.redScore as CachedAllianceScore | null)?.totals ?? null,
      blue: (c?.blueScore as CachedAllianceScore | null)?.totals ?? null,
    })
    setUndoStack([])
    setSubmittedMatchId(null)
  }, [field.matchId])

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
          {allianceOrder(flipSides).map((side) => (
            <Button
              key={side}
              className="h-32 text-xl font-bold text-white"
              style={{ backgroundColor: `var(--alliance-${side})` }}
              onClick={() => setAlliance(side)}
            >
              {side.toUpperCase()}
            </Button>
          ))}
        </div>
      </main>
    )
  }

  const allianceColor =
    alliance === "red" ? "var(--alliance-red)" : "var(--alliance-blue)"
  const myState = states[alliance]
  const myTotal = totals[alliance]?.total
  const robotCount = robotsFor(current, alliance)

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-3 p-3 pb-28">
      <header
        className="sticky top-0 z-20 grid grid-cols-3 items-center gap-2 px-3 py-2 text-white shadow-md"
        style={{ backgroundColor: allianceColor }}
      >
        <button
          type="button"
          className="justify-self-start text-left leading-none"
          onClick={() => setAlliance(null)}
          title="Switch alliance"
        >
          <div className="text-base font-bold">{alliance.toUpperCase()}</div>
          <div className="text-[0.6rem] opacity-80">tap to switch</div>
        </button>

        <div className="text-center leading-none">
          <div className="text-3xl font-bold tabular-nums">{myTotal ?? 0}</div>
          <div className="text-[0.6rem] opacity-80">total pts</div>
        </div>

        <div className="justify-self-end text-right leading-none">
          <div className="text-[0.65rem] opacity-80">
            {current ? matchShortLabel(current) : "no match"}
            {robotCount > 0 && ` · ${robotCount} robots`}
          </div>
          <div className="flex items-center justify-end gap-2 font-mono text-lg font-bold tabular-nums">
            <span>{PHASE_LABELS[field.phase] ?? field.phase}</span>
            <Countdown phaseEndsAt={field.phaseEndsAt} />
          </div>
        </div>
      </header>

      {current === null ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Waiting for the field admin to queue a match…
        </p>
      ) : submittedMatchId === current.id ? (
        <SubmittedView
          total={myTotal ?? 0}
          onResume={async () => {
            try {
              await resumeFn({ data: { eventId: event.id, judgeId } })
              setSubmittedMatchId(null)
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : String(error),
                { position: "top-center" }
              )
            }
          }}
        />
      ) : (
        <>
          <ScoringPad
            matchId={current.id}
            alliance={alliance}
            state={myState}
            robotCount={robotCount}
            onRecorded={(entry) => setUndoStack((prev) => [...prev, entry])}
          />
          <BottomBar
            undoStack={undoStack}
            onUndone={() => setUndoStack((prev) => prev.slice(0, -1))}
            onSubmit={async () => {
              try {
                await submitFn({
                  data: { eventId: event.id, judgeId, matchId: current.id },
                })
                setSubmittedMatchId(current.id)
                toast("Scores submitted", { position: "top-center" })
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : String(error),
                  { position: "top-center" }
                )
              }
            }}
          />
        </>
      )}
    </main>
  )
}

function SubmittedView({
  total,
  onResume,
}: {
  total: number
  onResume: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <CheckCircle2Icon className="size-12 text-primary" />
      <div>
        <h2 className="text-lg font-semibold">Scores submitted</h2>
        <p className="text-sm text-muted-foreground">
          Waiting for the next match…
        </p>
      </div>
      <div className="font-mono text-4xl font-bold tabular-nums">{total}</div>
      <p className="text-xs text-muted-foreground">points recorded</p>
      <Button variant="outline" onClick={onResume}>
        Resume scoring
      </Button>
    </div>
  )
}

function robotsFor(match: MatchRow | null, alliance: Alliance): number {
  if (!match) return 0
  const slots =
    alliance === "red"
      ? [match.red1, match.red2, match.red3]
      : [match.blue1, match.blue2, match.blue3]
  return Math.max(1, slots.filter(Boolean).length)
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

type UndoEntry = { id: string; label: string }
type RecordFn = (
  type: string,
  payload: Record<string, unknown>,
  undoLabel: string
) => void

function ScoringPad({
  matchId,
  alliance,
  state,
  robotCount,
  onRecorded,
}: {
  matchId: string
  alliance: Alliance
  state: StrongholdScore
  robotCount: number
  onRecorded: (entry: UndoEntry) => void
}) {
  const recordFn = useServerFn(recordScoreEvent)
  const [busy, setBusy] = useState(false)

  const record: RecordFn = async (type, payload, undoLabel) => {
    if (busy) return
    setBusy(true)
    if ("vibrate" in navigator) navigator.vibrate(30)
    try {
      const event = await recordFn({
        data: { matchId, alliance, type, payload },
      })
      onRecorded({ id: event.id, label: undoLabel })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error), {
        position: "top-center",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <AutoSection
        state={state}
        robotCount={robotCount}
        record={record}
        busy={busy}
      />
      <TeleopSection state={state} record={record} busy={busy} />
      <EndgameSection
        state={state}
        robotCount={robotCount}
        record={record}
        busy={busy}
      />
      <PenaltiesSection state={state} record={record} busy={busy} />
    </div>
  )
}

function SectionHeader({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <CardHeader className="flex-row items-center justify-between gap-2 py-3">
      <CardTitle className="text-sm tracking-wide uppercase">{title}</CardTitle>
      {children}
    </CardHeader>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="text-xs text-muted-foreground">
      {label}{" "}
      <span className="font-mono font-bold text-foreground tabular-nums">
        {value}
      </span>
    </span>
  )
}

function AutoSection({
  state,
  robotCount,
  record,
  busy,
}: {
  state: StrongholdScore
  robotCount: number
  record: RecordFn
  busy: boolean
}) {
  const reaches = state.robots.filter((r) => r.auto === "reach").length
  const defensePts =
    reaches * PointValues.REACH + state.crossings.auto * PointValues.AUTO_CROSS
  const goalPts =
    state.boulders.autoLow * PointValues.AUTO_LOW_GOAL +
    state.boulders.autoHigh * PointValues.AUTO_HIGH_GOAL

  return (
    <Card>
      <SectionHeader title="Auto">
        <Stat label="pts" value={defensePts + goalPts} />
      </SectionHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: robotCount }, (_, i) => {
          const choice = state.robots[i]?.auto ?? "none"
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs font-bold text-muted-foreground">
                R{i + 1}
              </span>
              {/* reach/cross stays switchable: only the chosen one locks */}
              <ChoiceButton
                label="Reach"
                selected={choice === "reach"}
                disabled={busy || choice === "reach"}
                onClick={() =>
                  record("REACH", { robotIndex: i }, `R${i + 1} Reach`)
                }
              />
              <ChoiceButton
                label="Cross"
                selected={choice === "cross"}
                disabled={busy || choice === "cross"}
                onClick={() =>
                  record("AUTO_CROSS", { robotIndex: i }, `R${i + 1} Auto Cross`)
                }
              />
            </div>
          )
        })}
        <div className="mt-1 flex gap-2">
          <CounterButton
            label="High Goal"
            count={state.boulders.autoHigh}
            disabled={busy}
            className="h-14"
            onClick={() =>
              record("AUTO_HIGH_GOAL", {}, "Auto High Goal")
            }
          />
          <CounterButton
            label="Low Goal"
            count={state.boulders.autoLow}
            disabled={busy}
            className="h-14"
            onClick={() => record("AUTO_LOW_GOAL", {}, "Auto Low Goal")}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function TeleopSection({
  state,
  record,
  busy,
}: {
  state: StrongholdScore
  record: RecordFn
  busy: boolean
}) {
  const goalPts =
    state.boulders.teleLow * PointValues.LOW_GOAL +
    state.boulders.teleHigh * PointValues.HIGH_GOAL
  const defensePts = state.crossings.teleop * PointValues.CROSS

  return (
    <Card>
      <SectionHeader title="Teleop">
        <div className="flex gap-3">
          <Stat label="total" value={goalPts + defensePts} />
          <Stat label="goals" value={goalPts} />
          <Stat label="def" value={defensePts} />
        </div>
      </SectionHeader>
      <CardContent className="flex gap-2">
        {/* defenses run top (1, furthest) to bottom (5, closest) */}
        <div className="flex flex-1 flex-col gap-1">
          {Array.from({ length: DEFENSES }, (_, i) => {
            const strength = state.defenses[i] ?? 0
            const crosses = DEFENSE_STRENGTH - strength
            const damaged = strength <= 0
            const damagePct = (crosses / DEFENSE_STRENGTH) * 100
            return (
              <button
                key={i}
                type="button"
                disabled={busy || damaged}
                onClick={() =>
                  record("CROSS", { defenseIndex: i }, `Defense ${i + 1} Cross`)
                }
                className={cn(
                  "flex items-center gap-2 border px-2 py-2 text-xs font-bold transition-colors",
                  damaged
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-border hover:bg-accent"
                )}
              >
                <span className="w-7 shrink-0 text-left">D{i + 1}</span>
                <div className="relative h-3 flex-1 overflow-hidden bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 bg-destructive transition-[width] duration-200"
                    style={{ width: `${damagePct}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-mono tabular-nums">
                  {damaged ? "DAMAGED" : `${crosses}/${DEFENSE_STRENGTH}`}
                </span>
              </button>
            )
          })}
        </div>
        {/* goals to the side; high above low */}
        <div className="flex w-24 shrink-0 flex-col gap-1">
          <CounterButton
            label="High Goal"
            count={state.boulders.teleHigh}
            disabled={busy}
            className="flex-1 flex-col gap-0.5 text-xs"
            onClick={() => record("HIGH_GOAL", {}, "High Goal")}
          />
          <CounterButton
            label="Low Goal"
            count={state.boulders.teleLow}
            disabled={busy}
            className="flex-1 flex-col gap-0.5 text-xs"
            onClick={() => record("LOW_GOAL", {}, "Low Goal")}
          />
        </div>
      </CardContent>
    </Card>
  )
}

const ENDGAME_OPTIONS = [
  { value: "none", type: "ENDGAME_CLEAR", label: "Nothing" },
  { value: "challenge", type: "CHALLENGE", label: "Challenge" },
  { value: "scale", type: "SCALE", label: "Scale" },
] as const

function EndgameSection({
  state,
  robotCount,
  record,
  busy,
}: {
  state: StrongholdScore
  robotCount: number
  record: RecordFn
  busy: boolean
}) {
  const total = state.robots.reduce(
    (sum, r) =>
      sum +
      (r.endgame === "challenge"
        ? PointValues.CHALLENGE
        : r.endgame === "scale"
          ? PointValues.SCALE
          : 0),
    0
  )

  return (
    <Card>
      <SectionHeader title="Endgame">
        <Stat label="pts" value={total} />
      </SectionHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: robotCount }, (_, i) => {
          const choice = state.robots[i]?.endgame ?? "none"
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs font-bold text-muted-foreground">
                R{i + 1}
              </span>
              {ENDGAME_OPTIONS.map((opt) => (
                <ChoiceButton
                  key={opt.value}
                  label={opt.label}
                  selected={choice === opt.value}
                  disabled={busy || choice === opt.value}
                  onClick={() =>
                    record(opt.type, { robotIndex: i }, `R${i + 1} ${opt.label}`)
                  }
                />
              ))}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function PenaltiesSection({
  state,
  record,
  busy,
}: {
  state: StrongholdScore
  record: RecordFn
  busy: boolean
}) {
  const toOpponent =
    state.fouls * PointValues.FOUL + state.techFouls * PointValues.TECH_FOUL

  return (
    <Card>
      <SectionHeader title="Penalties">
        <div className="flex gap-3">
          <Stat label="fouls" value={state.fouls + state.techFouls} />
          <Stat label="to opp." value={toOpponent} />
        </div>
      </SectionHeader>
      <CardContent className="flex gap-2">
        <CounterButton
          label="Foul"
          count={state.fouls}
          disabled={busy}
          className="h-14"
          onClick={() => record("FOUL", {}, "Foul")}
        />
        <CounterButton
          label="Tech Foul"
          count={state.techFouls}
          disabled={busy}
          className="h-14"
          onClick={() => record("TECH_FOUL", {}, "Tech Foul")}
        />
      </CardContent>
    </Card>
  )
}

function ChoiceButton({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string
  selected: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-12 flex-1 border text-sm font-semibold transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border hover:bg-accent"
      )}
    >
      {label}
    </button>
  )
}

function CounterButton({
  label,
  count,
  disabled,
  className,
  onClick,
}: {
  label: string
  count: number
  disabled: boolean
  className?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 border border-border font-semibold transition-colors hover:bg-accent disabled:opacity-50",
        className
      )}
    >
      <span>{label}</span>
      <span className="font-mono text-base font-bold tabular-nums">{count}</span>
    </button>
  )
}

function BottomBar({
  undoStack,
  onUndone,
  onSubmit,
}: {
  undoStack: UndoEntry[]
  onUndone: () => void
  onSubmit: () => Promise<void>
}) {
  const undoFn = useServerFn(undoScoreEvent)
  const [submitting, setSubmitting] = useState(false)
  const last = undoStack.at(-1)

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md gap-2 border-t bg-background/95 p-3 backdrop-blur">
      <Button
        variant="secondary"
        className="h-12 flex-1"
        disabled={last === undefined}
        onClick={async () => {
          if (last === undefined) return
          try {
            await undoFn({ data: { scoreEventId: last.id } })
            onUndone()
            toast(`Undo: ${last.label} removed`, { position: "top-center" })
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : String(error),
              { position: "top-center" }
            )
          }
        }}
      >
        <Undo2Icon />
        {last ? `Undo: ${last.label}` : "Undo"}
      </Button>
      <Button
        className="h-12 flex-1"
        disabled={submitting}
        onClick={async () => {
          setSubmitting(true)
          try {
            await onSubmit()
          } finally {
            setSubmitting(false)
          }
        }}
      >
        <SendIcon />
        Submit scores
      </Button>
    </div>
  )
}
