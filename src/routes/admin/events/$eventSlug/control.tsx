import { useEffect, useState } from "react"
import {
  BanIcon,
  CoffeeIcon,
  DoorOpenIcon,
  FlagIcon,
  HandshakeIcon,
  ListOrderedIcon,
  SwordsIcon,
  TrophyIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
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
import { BracketGraphic } from "@/components/bracket/bracket-graphic"
import { SelectionBoard } from "@/components/selection-board"
import { setDisplayView } from "@/server/functions/display"
import { getJudgeStatus } from "@/server/functions/judges"
import type { JudgeStatus } from "@/server/judges/registry"
import { postMatch } from "@/server/functions/scoring"
import type { DisplayView } from "@/server/functions/display"
import { listMatches } from "@/server/functions/matches"
import {
  generatePlayoffBracket,
  getBracketView,
} from "@/server/functions/playoffs"
import {
  getSelection,
  selectionInvite,
  selectionRespond,
  selectionUndo,
} from "@/server/functions/selection"
import type { EnrichedSelectionState } from "@/server/services/selection"
import type { CachedAllianceScore } from "@/server/services/scoring"
import { ALLIANCE_ORDER } from "@/shared/alliance"
import { matchShortLabel } from "@/shared/match-format"
import { topicFor } from "@/shared/realtime-messages"
import type { ServerMessage } from "@/shared/realtime-messages"

export const Route = createFileRoute("/admin/events/$eventSlug/control")({
  loader: async ({ context }) => {
    const [field, matches, selection, bracket, judgeStatus] = await Promise.all(
      [
        getFieldState({ data: { eventId: context.event.id } }),
        listMatches({ data: { eventId: context.event.id } }),
        getSelection({ data: { eventId: context.event.id } }),
        getBracketView({ data: { eventId: context.event.id } }),
        getJudgeStatus({ data: { eventId: context.event.id } }),
      ]
    )
    return { field, matches, selection, bracket, judgeStatus }
  },
  component: ControlPanel,
})

type Totals = Extract<ServerMessage, { type: "score_update" }>["red"]
type MatchRow = Awaited<ReturnType<typeof listMatches>>[number]

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

const matchLabel = matchShortLabel

function ControlPanel() {
  const { event } = Route.useRouteContext()
  const eventId = event.id
  const loaded = Route.useLoaderData()

  const router = useRouter()
  const [field, setField] = useState<FieldState>(loaded.field)
  const [matches, setMatches] = useState(loaded.matches)
  const [view, setView] = useState(event.displayView as DisplayView)
  const [selection, setSelection] = useState(loaded.selection)
  const [judgeStatus, setJudgeStatus] = useState<JudgeStatus>(
    loaded.judgeStatus
  )

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
    if (message.type === "view_change") {
      setView(message.view as DisplayView)
    }
    if (message.type === "selection_update") {
      setSelection(message.payload as EnrichedSelectionState)
    }
    if (message.type === "judges_update") {
      setJudgeStatus(message.payload as JudgeStatus)
    }
    if (message.type === "bracket_update") {
      void router.invalidate()
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
  const judgeStatusFn = useServerFn(getJudgeStatus)

  // fallback poll catches judges pruned for inactivity (no event fires for them)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        setJudgeStatus(await judgeStatusFn({ data: { eventId } }))
      } catch {
        /* transient */
      }
    }, 7000)
    return () => clearInterval(interval)
  }, [eventId, judgeStatusFn])

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
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Field entry</span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={field.running}
                  onClick={() => run(() => noEntryFn({ data: { eventId } }))}
                >
                  <BanIcon className="size-4" />
                  Do not enter
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={field.running}
                  onClick={() => run(() => safeFn({ data: { eventId } }))}
                >
                  <DoorOpenIcon className="size-4" />
                  Safe to enter
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Match control</span>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  className="gap-2"
                  disabled={
                    field.running || !current || current.status !== "scheduled"
                  }
                  onClick={() => run(() => playFn({ data: { eventId } }))}
                >
                  Play match
                </Button>
                <Button
                  variant="destructive"
                  className="gap-2"
                  disabled={!field.running}
                  onClick={() => run(() => faultFn({ data: { eventId } }))}
                >
                  Field fault
                </Button>
                <Button
                  variant="secondary"
                  className="gap-2"
                  disabled={!canReplay}
                  onClick={() => run(() => replayFn({ data: { eventId } }))}
                >
                  Replay match
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {event.status === "alliance_selection" && (
        <SelectionCard
          eventId={eventId}
          selection={selection}
          onState={setSelection}
        />
      )}
      {event.status === "playoffs" && (
        <PlayoffCard eventId={eventId} bracket={loaded.bracket} />
      )}

      <DisplayCard eventId={eventId} eventSlug={event.slug} view={view} />

      <PublishCard
        eventId={eventId}
        current={current}
        running={field.running}
        view={view}
        redTotal={totals.red?.total ?? null}
        blueTotal={totals.blue?.total ?? null}
        judgeStatus={judgeStatus}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {ALLIANCE_ORDER.map((side) => (
          <AlliancePoints
            key={side}
            alliance={side}
            teams={
              current
                ? side === "red"
                  ? [current.red1, current.red2, current.red3]
                  : [current.blue1, current.blue2, current.blue3]
                : []
            }
            totals={totals[side]}
          />
        ))}
      </div>
    </div>
  )
}

const POST_VIEWS: { view: DisplayView; label: string }[] = [
  { view: "results", label: "Results" },
  { view: "rankings", label: "Rankings" },
  { view: "intermission", label: "Intermission" },
]

function PublishCard({
  eventId,
  current,
  running,
  view,
  redTotal,
  blueTotal,
  judgeStatus,
}: {
  eventId: string
  current: MatchRow | null
  running: boolean
  view: DisplayView
  redTotal: number | null
  blueTotal: number | null
  judgeStatus: JudgeStatus
}) {
  const postMatchFn = useServerFn(postMatch)
  const setViewFn = useServerFn(setDisplayView)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const submitted = current
    ? judgeStatus.judges.filter((j) => j.submittedMatchId === current.id).length
    : 0
  const active = judgeStatus.active
  const allSubmitted = active > 0 && submitted >= active
  const posted = current?.status === "posted"
  const canPublish = !running && current !== null && current.status === "scored"

  async function moveView(next: DisplayView) {
    try {
      await setViewFn({ data: { eventId, view: next } })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function doPublish() {
    if (!current) return
    setPublishing(true)
    try {
      // fully publish: finalize the score, then move the audience display
      await postMatchFn({ data: { matchId: current.id } })
      await setViewFn({ data: { eventId, view: "results" } })
      toast.success("Results published")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPublishing(false)
    }
  }

  function handlePublish() {
    if (active > 0 && !allSubmitted) {
      setConfirmOpen(true)
      return
    }
    void doPublish()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publish &amp; results</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Judges submitted</span>
            <Badge variant={allSubmitted ? "default" : "outline"}>
              {submitted} / {active}
            </Badge>
          </div>
          <div className="flex items-center gap-2 font-mono text-lg font-bold tabular-nums">
            {ALLIANCE_ORDER.map((side, idx) => (
              <span key={side} className="flex items-center gap-2">
                {idx > 0 && (
                  <span className="text-sm text-muted-foreground">–</span>
                )}
                <span style={{ color: `var(--alliance-${side})` }}>
                  {(side === "red" ? redTotal : blueTotal) ?? 0}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!canPublish || publishing} onClick={handlePublish}>
            Publish results
          </Button>
          {posted && <Badge variant="secondary">Published</Badge>}
          {!canPublish && !posted && (
            <p className="text-sm text-muted-foreground">
              Score the match to enable publishing
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">
            Audience display
          </span>
          <div className="flex flex-wrap gap-2">
            {POST_VIEWS.map(({ view: candidate, label }) => (
              <Button
                key={candidate}
                size="sm"
                variant={view === candidate ? "default" : "outline"}
                onClick={() => moveView(candidate)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Publish before all judges submit?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Only {submitted} of {active} judges have submitted their scores.
              You can override and publish now, or wait for the rest.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Wait</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false)
                void doPublish()
              }}
            >
              Publish anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
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

const VIEW_LABELS: Record<DisplayView, string> = {
  match: "Match",
  lineup: "Lineup",
  results: "Results",
  rankings: "Rankings",
  selection: "Selection",
  bracket: "Bracket",
  intermission: "Intermission",
  camera: "Camera only",
}

const VIEW_ICONS: Record<DisplayView, LucideIcon> = {
  lineup: UsersIcon,
  match: SwordsIcon,
  results: FlagIcon,
  rankings: ListOrderedIcon,
  selection: HandshakeIcon,
  bracket: TrophyIcon,
  intermission: CoffeeIcon,
  camera: VideoIcon,
}

// Ordered to match the natural run-of-show: a match plays out left-to-right,
// then the event flips into playoff mode. Intermission/camera are pulled out
// into a quick-switch row since they're used to break away from either flow.
const VIEW_GROUPS: {
  label: string
  hint: string
  views: DisplayView[]
}[] = [
  {
    label: "Match play",
    hint: "lineup → match → results → rankings",
    views: ["lineup", "match", "results", "rankings"],
  },
  {
    label: "Playoffs",
    hint: "alliance selection → elimination bracket",
    views: ["selection", "bracket"],
  },
]

const QUICK_VIEWS: DisplayView[] = ["intermission", "camera"]

function DisplayCard({
  eventId,
  eventSlug,
  view,
}: {
  eventId: string
  eventSlug: string
  view: DisplayView
}) {
  const setViewFn = useServerFn(setDisplayView)

  async function switchTo(candidate: DisplayView) {
    try {
      await setViewFn({ data: { eventId, view: candidate } })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  function ViewButton({ candidate }: { candidate: DisplayView }) {
    const Icon = VIEW_ICONS[candidate]
    const active = view === candidate
    return (
      <Button
        variant={active ? "default" : "outline"}
        size="sm"
        aria-pressed={active}
        className="justify-start gap-2"
        onClick={() => switchTo(candidate)}
      >
        <Icon className="size-4" />
        {VIEW_LABELS[candidate]}
      </Button>
    )
  }

  const LiveIcon = VIEW_ICONS[view]

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Display screen</CardTitle>
          </div>

          <Badge variant="secondary" className="gap-1.5">
            <LiveIcon className="size-3.5" />
            Live: {VIEW_LABELS[view]}
          </Badge>
        </div>
        <div className="flex flex-row items-center justify-center gap-2">
          <div className="flex gap-2">
            {QUICK_VIEWS.map((candidate) => {
              const Icon = VIEW_ICONS[candidate]
              const active = view === candidate
              return (
                <Button
                  key={candidate}
                  variant={active ? "default" : "secondary"}
                  size="sm"
                  aria-pressed={active}
                  className="gap-2"
                  onClick={() => switchTo(candidate)}
                >
                  <Icon className="size-4" />
                  {VIEW_LABELS[candidate]}
                </Button>
              )
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {VIEW_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{group.label}</span>
                <span className="text-xs text-muted-foreground">
                  {group.hint}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.views.map((candidate) => (
                  <ViewButton key={candidate} candidate={candidate} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="relative mx-auto aspect-video w-full max-w-2xl overflow-hidden border bg-black">
          <iframe
            src={`/display/${eventSlug}?preview=1`}
            title="Display preview"
            className="pointer-events-none absolute top-0 left-0 h-[200%] w-[200%] origin-top-left scale-50 border-0"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function SelectionCard({
  eventId,
  selection,
  onState,
}: {
  eventId: string
  selection: EnrichedSelectionState
  onState: (state: EnrichedSelectionState) => void
}) {
  const inviteFn = useServerFn(selectionInvite)
  const respondFn = useServerFn(selectionRespond)
  const undoFn = useServerFn(selectionUndo)

  async function act(action: () => Promise<EnrichedSelectionState>) {
    try {
      onState(await action())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <Card className="@container/board">
      <CardHeader>
        <CardTitle>Alliance selection</CardTitle>
        <CardDescription>
          {selection.complete
            ? "Selection complete — advance the event to playoffs when ready"
            : selection.pendingInvite
              ? `Waiting on ${selection.pendingInvite.team.name} to respond`
              : `Alliance ${selection.currentAllianceNumber} is picking (round ${selection.pickRound})`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SelectionBoard state={selection} showInviteBanner={false} />

        {selection.pendingInvite && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                act(() => respondFn({ data: { eventId, response: "accept" } }))
              }
            >
              Accept on behalf
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                act(() => respondFn({ data: { eventId, response: "decline" } }))
              }
            >
              Decline on behalf
            </Button>
          </div>
        )}

        {!selection.complete &&
          !selection.pendingInvite &&
          selection.available.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Invite (rank order):
              </span>
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {selection.available.map((team, index) => (
                  <Button
                    key={team.teamId}
                    size="sm"
                    variant="outline"
                    className="w-full justify-start gap-2 font-normal"
                    onClick={() =>
                      act(() =>
                        inviteFn({ data: { eventId, teamId: team.teamId } })
                      )
                    }
                  >
                    <span className="w-5 text-center text-xs font-bold text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <span className="font-mono font-bold">{team.number}</span>
                    <span className="truncate">{team.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

        <div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => act(() => undoFn({ data: { eventId } }))}
          >
            Undo last action
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PlayoffCard({
  eventId,
  bracket,
}: {
  eventId: string
  bracket: Parameters<typeof BracketGraphic>[0]["bracket"]
}) {
  const router = useRouter()
  const generateFn = useServerFn(generatePlayoffBracket)
  const hasPosted = bracket.matches.some((m) => m.status === "posted")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Playoff bracket</CardTitle>
        <CardDescription>
          Double elimination — queue playoff matches from the match selector
          above
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!hasPosted && (
          <div>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await generateFn({ data: { eventId } })
                  await router.invalidate()
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : String(error)
                  )
                }
              }}
            >
              {bracket.matches.length > 0
                ? "Regenerate bracket"
                : "Generate bracket"}
            </Button>
          </div>
        )}
        <BracketGraphic bracket={bracket} />
      </CardContent>
    </Card>
  )
}
