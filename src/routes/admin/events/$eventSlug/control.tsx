import { useEffect, useState } from "react"
import {
  BanIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CoffeeIcon,
  DoorOpenIcon,
  FlagIcon,
  HandshakeIcon,
  ListOrderedIcon,
  RectangleVerticalIcon,
  SwordsIcon,
  TrophyIcon,
  UsersIcon,
  VideoIcon,
  XIcon,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { TeamCards } from "@/components/team-cards"
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
import { issueCard, listCards, revokeCard } from "@/server/functions/cards"
import { getJudgeStatus } from "@/server/functions/judges"
import type { JudgeStatus } from "@/server/judges/registry"
import { postMatch } from "@/server/functions/scoring"
import type { DisplayView } from "@/server/functions/display"
import { listMatches } from "@/server/functions/matches"
import {
  generatePlayoffBracket,
  getBracketView,
  setFinalsBestOf3,
} from "@/server/functions/playoffs"
import {
  getSelection,
  selectionInvite,
  selectionRespond,
  selectionUndo,
  setSelectionBackup,
} from "@/server/functions/selection"
import {
  listEventTeams,
  setDisplaySetting,
  setFlipAllianceSides,
} from "@/server/functions/events"
import type { EnrichedSelectionState } from "@/server/services/selection"
import type { CachedAllianceScore } from "@/server/services/scoring"
import { allianceOrder } from "@/shared/alliance"
import type { Alliance } from "@/shared/alliance"
import { cardStateFrom } from "@/shared/cards"
import type { CardType, TeamCardState } from "@/shared/cards"
import { matchShortLabel, sortMatchesByType } from "@/shared/match-format"
import { topicFor } from "@/shared/realtime-messages"
import type { ServerMessage } from "@/shared/realtime-messages"

export const Route = createFileRoute("/admin/events/$eventSlug/control")({
  loader: async ({ context }) => {
    const [field, matches, selection, bracket, judgeStatus, roster, cards] =
      await Promise.all([
        getFieldState({ data: { eventId: context.event.id } }),
        listMatches({ data: { eventId: context.event.id } }),
        getSelection({ data: { eventId: context.event.id } }),
        getBracketView({ data: { eventId: context.event.id } }),
        getJudgeStatus({ data: { eventId: context.event.id } }),
        listEventTeams({ data: { eventId: context.event.id } }),
        listCards({ data: { eventId: context.event.id } }),
      ])
    return { field, matches, selection, bracket, judgeStatus, roster, cards }
  },
  component: ControlPanel,
})

type Totals = Extract<ServerMessage, { type: "score_update" }>["red"]
type MatchRow = Awaited<ReturnType<typeof listMatches>>[number]
type RosterTeam = Awaited<ReturnType<typeof listEventTeams>>[number]
type CardRow = Awaited<ReturnType<typeof listCards>>[number]

/** per-team card state from a flat card list, for the control panel */
function cardStatesByTeam(cards: CardRow[]): Map<string, TeamCardState> {
  const counts = new Map<string, { yellows: number; reds: number }>()
  for (const card of cards) {
    const entry = counts.get(card.teamId) ?? { yellows: 0, reds: 0 }
    if (card.type === "yellow") entry.yellows += 1
    else entry.reds += 1
    counts.set(card.teamId, entry)
  }
  const states = new Map<string, TeamCardState>()
  for (const [teamId, c] of counts) {
    states.set(teamId, cardStateFrom(c.yellows, c.reds))
  }
  return states
}

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

// shown in the issue-card dialog to remind the judge of each card's ruling
const CARD_RULINGS: Record<CardType, string> = {
  yellow:
    "Dealing intentional or egregious damage to other robots. Two yellow cards count as a red card.",
  red: "Excessive ungracious or unprofessional behavior. Two red cards disqualify the team.",
}

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
  const [flipSides, setFlipSides] = useState(
    event.settings.flipAllianceSides ?? false
  )
  const [advanceOnLineup, setAdvanceOnLineup] = useState(false)
  const [finalsBo3, setFinalsBo3] = useState(
    event.settings.finalsBestOf3 ?? false
  )
  const [hideAfterMatch, setHideAfterMatch] = useState(
    event.settings.hideAfterMatchEnd ?? false
  )
  const [autoRotate, setAutoRotate] = useState(
    event.settings.autoRotateViews ?? false
  )
  const [alwaysLineup, setAlwaysLineup] = useState(
    event.settings.alwaysShowLineup ?? false
  )
  const [cards, setCards] = useState(loaded.cards)
  const order = allianceOrder(flipSides)

  const current = matches.find((m) => m.id === field.matchId) ?? null
  // queue order: practice → quals → playoffs, then play order
  const queueMatches = sortMatchesByType(matches)
  // "advance on lineup" anchors on the currently queued match and moves to the
  // next still-scheduled match after it. If nothing is queued yet we return
  // null rather than guessing — never jump to the start of the schedule.
  const currentQueueIndex = queueMatches.findIndex(
    (m) => m.id === field.matchId
  )
  const nextMatchId =
    currentQueueIndex >= 0
      ? (queueMatches
          .slice(currentQueueIndex + 1)
          .find((m) => m.status === "scheduled")?.id ?? null)
      : null
  // prev/next step through the queue order regardless of status; when nothing is
  // queued yet, "next" picks the first match so the buttons are always useful
  const prevQueueId =
    currentQueueIndex > 0 ? queueMatches[currentQueueIndex - 1].id : null
  const nextQueueId =
    currentQueueIndex >= 0
      ? (queueMatches.at(currentQueueIndex + 1)?.id ?? null)
      : (queueMatches.at(0)?.id ?? null)
  const [totals, setTotals] = useState<{ red: Totals; blue: Totals }>({
    red: (current?.redScore as CachedAllianceScore | null)?.totals ?? null,
    blue: (current?.blueScore as CachedAllianceScore | null)?.totals ?? null,
  })

  // re-sync the queue when the loader refetches (e.g. after playoff matches are
  // generated): score_update only patches existing rows, so newly created
  // matches reach the dropdown only through a fresh loader payload
  useEffect(() => {
    setMatches(loaded.matches)
  }, [loaded.matches])

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
    if (message.type === "settings_update") {
      setFlipSides(message.flipAllianceSides)
      if (message.finalsBestOf3 !== undefined) {
        setFinalsBo3(message.finalsBestOf3)
      }
      if (message.hideAfterMatchEnd !== undefined) {
        setHideAfterMatch(message.hideAfterMatchEnd)
      }
      if (message.autoRotateViews !== undefined) {
        setAutoRotate(message.autoRotateViews)
      }
      if (message.alwaysShowLineup !== undefined) {
        setAlwaysLineup(message.alwaysShowLineup)
      }
    }
    if (message.type === "bracket_update") {
      void router.invalidate()
    }
    if (message.type === "cards_update") {
      void listCardsFn({ data: { eventId } }).then(setCards)
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
  const listCardsFn = useServerFn(listCards)
  const flipFn = useServerFn(setFlipAllianceSides)
  const finalsFn = useServerFn(setFinalsBestOf3)
  const displaySettingFn = useServerFn(setDisplaySetting)

  // optimistic toggle for the display-automation settings; settings_update
  // confirms (or a thrown error rolls back via the local setter)
  function toggleDisplaySetting(
    key: "hideAfterMatchEnd" | "autoRotateViews" | "alwaysShowLineup",
    set: (value: boolean) => void,
    next: boolean
  ) {
    set(next)
    void displaySettingFn({ data: { eventId, key, value: next } }).catch(
      (error) => {
        set(!next)
        toast.error(error instanceof Error ? error.message : String(error))
      }
    )
  }

  async function toggleFlip(next: boolean) {
    setFlipSides(next) // optimistic; the settings_update broadcast confirms it
    try {
      await flipFn({ data: { eventId, flip: next } })
    } catch (error) {
      setFlipSides(!next)
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function toggleFinals(next: boolean) {
    setFinalsBo3(next) // optimistic
    try {
      await finalsFn({ data: { eventId, value: next } })
      // toggling regenerates the bracket when one exists — refresh the queue
      await router.invalidate()
    } catch (error) {
      setFinalsBo3(!next)
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

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
                {queueMatches.map((match) => (
                  <SelectItem key={match.id} value={match.id}>
                    {matchLabel(match)} — {match.status}
                    {match.redPoints !== null
                      ? ` (${match.redPoints}–${match.bluePoints})`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={field.running || prevQueueId === null}
                onClick={() => {
                  if (prevQueueId)
                    run(() =>
                      setMatchFn({ data: { eventId, matchId: prevQueueId } })
                    )
                }}
              >
                <ChevronLeftIcon className="size-4" />
                Previous match
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={field.running || nextQueueId === null}
                onClick={() => {
                  if (nextQueueId)
                    run(() =>
                      setMatchFn({ data: { eventId, matchId: nextQueueId } })
                    )
                }}
              >
                Next match
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Control</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            {/* left column: field entry + match control */}
            <div className="flex flex-col gap-4">
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
                      field.running ||
                      !current ||
                      current.status !== "scheduled"
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
            </div>
            {/* right column: field settings */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Settings</span>
              <SettingSwitch
                id="flip-alliance-sides"
                label="Flip alliances"
                checked={flipSides}
                onCheckedChange={(checked) => void toggleFlip(checked)}
              />
              <SettingSwitch
                id="advance-on-lineup"
                label="Advance on lineup"
                checked={advanceOnLineup}
                onCheckedChange={setAdvanceOnLineup}
              />
              <SettingSwitch
                id="finals-best-of-3"
                label="Finals best of 3"
                checked={finalsBo3}
                onCheckedChange={(checked) => void toggleFinals(checked)}
              />
              <SettingSwitch
                id="hide-after-match-end"
                label="Hide scores after match"
                checked={hideAfterMatch}
                onCheckedChange={(checked) =>
                  toggleDisplaySetting(
                    "hideAfterMatchEnd",
                    setHideAfterMatch,
                    checked
                  )
                }
              />
              <SettingSwitch
                id="auto-rotate-views"
                label="Auto rotate views"
                checked={autoRotate}
                onCheckedChange={(checked) =>
                  toggleDisplaySetting(
                    "autoRotateViews",
                    setAutoRotate,
                    checked
                  )
                }
              />
              <SettingSwitch
                id="always-show-lineup"
                label="Show lineup header"
                checked={alwaysLineup}
                onCheckedChange={(checked) =>
                  toggleDisplaySetting(
                    "alwaysShowLineup",
                    setAlwaysLineup,
                    checked
                  )
                }
              />
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
        <PlayoffCard
          eventId={eventId}
          bracket={loaded.bracket}
          selection={selection}
          onSelection={setSelection}
          currentMatchId={field.matchId}
        />
      )}

      <DisplayCard
        eventId={eventId}
        eventSlug={event.slug}
        view={view}
        matchEnded={field.phase === "post_match"}
        onSafeToEnter={() => safeFn({ data: { eventId } })}
        advanceOnLineup={advanceOnLineup}
        nextMatchId={nextMatchId}
        onQueueMatch={(matchId) => setMatchFn({ data: { eventId, matchId } })}
      />

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <PublishCard
          eventId={eventId}
          current={current}
          running={field.running}
          view={view}
          redTotal={totals.red?.total ?? null}
          blueTotal={totals.blue?.total ?? null}
          judgeStatus={judgeStatus}
          order={order}
        />

        {/* Publish drives the row height; the cards panel fills its cell and
            scrolls its list rather than stretching the row taller */}
        <div className="lg:relative">
          <CardsPanel
            eventId={eventId}
            roster={loaded.roster}
            currentTeamIds={
              current
                ? [
                    current.red1,
                    current.red2,
                    current.red3,
                    current.red4,
                    current.blue1,
                    current.blue2,
                    current.blue3,
                    current.blue4,
                  ].filter((id): id is string => id !== null)
                : []
            }
            cards={cards}
            onCards={setCards}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {order.map((side) => (
          <AlliancePoints
            key={side}
            alliance={side}
            teams={
              current
                ? side === "red"
                  ? [current.red1, current.red2, current.red3, current.red4]
                  : [current.blue1, current.blue2, current.blue3, current.blue4]
                : []
            }
            totals={totals[side]}
          />
        ))}
      </div>
    </div>
  )
}

/** A labeled settings toggle row used in the Control card's settings column. */
function SettingSwitch({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0">
      <Label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function CardsPanel({
  eventId,
  roster,
  currentTeamIds,
  cards,
  onCards,
}: {
  eventId: string
  roster: RosterTeam[]
  currentTeamIds: string[]
  cards: CardRow[]
  onCards: (cards: CardRow[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [teamId, setTeamId] = useState("")
  const [type, setType] = useState<CardType>("yellow")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  const issueFn = useServerFn(issueCard)
  const revokeFn = useServerFn(revokeCard)
  const listCardsFn = useServerFn(listCards)

  const states = cardStatesByTeam(cards)
  const numberOf = new Map(roster.map((t) => [t.teamId, t.number]))
  const nameOf = new Map(roster.map((t) => [t.teamId, t.name]))
  // teams currently on the field first, then the rest of the roster by number
  const onField = roster.filter((t) => currentTeamIds.includes(t.teamId))
  const others = roster
    .filter((t) => !currentTeamIds.includes(t.teamId))
    .sort((a, b) => a.number - b.number)

  async function refresh() {
    onCards(await listCardsFn({ data: { eventId } }))
  }

  async function submit() {
    if (!teamId) return
    setBusy(true)
    try {
      await issueFn({ data: { eventId, teamId, type, reason } })
      await refresh()
      setOpen(false)
      setTeamId("")
      setReason("")
      setType("yellow")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(cardId: string) {
    try {
      await revokeFn({ data: { cardId } })
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  function TeamOption({ id }: { id: string }) {
    return (
      <SelectItem value={id}>
        {numberOf.get(id) ?? "?"} — {nameOf.get(id) ?? "Unknown"}
        {states.get(id)?.disqualified ? " (DQ)" : ""}
      </SelectItem>
    )
  }

  return (
    <Card className="flex flex-col overflow-hidden lg:absolute lg:inset-0">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Cards</CardTitle>
          <CardDescription>
            Yellow / red cards. Two yellows count as a red; two reds disqualify.
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <RectangleVerticalIcon className="size-4 fill-yellow-400 text-yellow-500" />
              Issue card
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue a card</DialogTitle>
              <DialogDescription>
                A red card to a team in the live match zeroes that alliance's
                score for the match.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Team</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a team…" />
                  </SelectTrigger>
                  <SelectContent>
                    {onField.length > 0 && (
                      <>
                        {onField.map((t) => (
                          <TeamOption key={t.teamId} id={t.teamId} />
                        ))}
                        <Separator className="my-1" />
                      </>
                    )}
                    {others.map((t) => (
                      <TeamOption key={t.teamId} id={t.teamId} />
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Card</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={type === "yellow" ? "default" : "outline"}
                    className="gap-2"
                    onClick={() => setType("yellow")}
                  >
                    <RectangleVerticalIcon className="size-4 fill-yellow-400 text-yellow-500" />
                    Yellow
                  </Button>
                  <Button
                    type="button"
                    variant={type === "red" ? "destructive" : "outline"}
                    className="gap-2"
                    onClick={() => setType("red")}
                  >
                    <RectangleVerticalIcon className="size-4 fill-red-600 text-red-600" />
                    Red
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {CARD_RULINGS[type]}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="card-reason">Reason</Label>
                <Textarea
                  id="card-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. intentional damage to another robot"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button onClick={submit} disabled={!teamId || busy}>
                Issue {type} card
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cards issued.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {[...cards].reverse().map((card) => (
              <li
                key={card.id}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <TeamCards
                  cards={cardStateFrom(
                    card.type === "yellow" ? 1 : 0,
                    card.type === "red" ? 1 : 0
                  )}
                  size="sm"
                />
                <span className="font-mono font-semibold tabular-nums">
                  {numberOf.get(card.teamId) ?? "?"}
                </span>
                <span className="flex-1 truncate text-muted-foreground">
                  {card.reason || "—"}
                  {card.matchId ? " · score zeroed" : ""}
                </span>
                {states.get(card.teamId)?.disqualified && (
                  <Badge variant="destructive">DQ</Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => revoke(card.id)}
                  title="Revoke card"
                >
                  <XIcon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const POST_VIEWS: { view: DisplayView; label: string }[] = [
  { view: "results", label: "Results" },
  { view: "rankings", label: "Rankings" },
  { view: "bracket", label: "Bracket" },
  { view: "camera", label: "Camera Only" },
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
  order,
}: {
  eventId: string
  current: MatchRow | null
  running: boolean
  view: DisplayView
  redTotal: number | null
  blueTotal: number | null
  judgeStatus: JudgeStatus
  order: readonly [Alliance, Alliance]
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
    // confirm whenever we can't verify every judge submitted — including when
    // 0 judges show as active (a judge may have scored without registering)
    if (!allSubmitted) {
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
            {order.map((side, idx) => (
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
              Please wait for match to end.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">
            Quick Switch Views
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
              Unable to verify all judges submitted
            </AlertDialogTitle>
            <AlertDialogDescription>
              {active > 0
                ? `Only ${submitted} of ${active} judges are showing as submitted`
                : "No judges are showing as connected"}
              , but a judge may have scored without the system registering it.
              Please confirm the final scores below before publishing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center justify-center gap-3 py-2 font-mono text-2xl font-bold tabular-nums">
            {order.map((side, idx) => (
              <span key={side} className="flex items-center gap-3">
                {idx > 0 && (
                  <span className="text-base text-muted-foreground">–</span>
                )}
                <span style={{ color: `var(--alliance-${side})` }}>
                  {side.toUpperCase()}{" "}
                  {(side === "red" ? redTotal : blueTotal) ?? 0}
                </span>
              </span>
            ))}
          </div>
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
  schedule: "Schedule",
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
  schedule: CalendarDaysIcon,
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
    label: "Informational",
    hint: "selection · bracket · rolling schedule",
    views: ["selection", "bracket", "schedule"],
  },
]

const QUICK_VIEWS: DisplayView[] = ["intermission", "camera"]

function DisplayCard({
  eventId,
  eventSlug,
  view,
  matchEnded,
  onSafeToEnter,
  advanceOnLineup,
  nextMatchId,
  onQueueMatch,
}: {
  eventId: string
  eventSlug: string
  view: DisplayView
  matchEnded: boolean
  onSafeToEnter: () => Promise<unknown>
  advanceOnLineup: boolean
  nextMatchId: string | null
  onQueueMatch: (matchId: string) => Promise<unknown>
}) {
  const setViewFn = useServerFn(setDisplayView)

  async function switchTo(candidate: DisplayView) {
    try {
      await setViewFn({ data: { eventId, view: candidate } })
      // once a match is over, moving to the camera-only view means the field is
      // clear for teams — flip field entry to "safe to enter" automatically
      if (candidate === "camera" && matchEnded) {
        await onSafeToEnter()
      }
      // with "Advance on lineup" on, showing the lineup always queues the next
      // match so the lineup displayed is the upcoming match
      if (candidate === "lineup" && advanceOnLineup && nextMatchId) {
        await onQueueMatch(nextMatchId)
      }
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

          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="gap-1.5">
              <LiveIcon className="size-3.5" />
              Live: {VIEW_LABELS[view]}
            </Badge>
          </div>
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
  selection,
  onSelection,
  currentMatchId,
}: {
  eventId: string
  bracket: Parameters<typeof BracketGraphic>[0]["bracket"]
  selection: EnrichedSelectionState
  onSelection: (state: EnrichedSelectionState) => void
  currentMatchId: string | null
}) {
  const router = useRouter()
  const generateFn = useServerFn(generatePlayoffBracket)
  const hasPosted = bracket.matches.some((m) => m.status === "posted")
  const [bracketOpen, setBracketOpen] = useState(true)

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
        <Collapsible
          open={bracketOpen}
          onOpenChange={setBracketOpen}
          className="flex flex-col gap-3 border-t pt-3"
        >
          <CollapsibleTrigger className="group flex items-center justify-between text-sm font-semibold">
            Bracket &amp; backups
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-4">
            <BracketGraphic bracket={bracket} currentMatchId={currentMatchId} />
            <BackupRobots
              eventId={eventId}
              selection={selection}
              onSelection={onSelection}
            />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

const NO_BACKUP = "__none__"

/** Per-alliance backup-robot assignment, available once selection is locked. */
function BackupRobots({
  eventId,
  selection,
  onSelection,
}: {
  eventId: string
  selection: EnrichedSelectionState
  onSelection: (state: EnrichedSelectionState) => void
}) {
  const setBackupFn = useServerFn(setSelectionBackup)

  // teams eligible to be a backup: not on any alliance (captain/pick/backup).
  // available/declined pools plus any current backups, deduped in rank order.
  const assignedBackupIds = new Set(
    selection.alliances
      .map((a) => a.backup?.teamId)
      .filter((id): id is string => Boolean(id))
  )
  const seen = new Set<string>()
  const freePool = [
    ...selection.backups,
    ...selection.available,
    ...selection.declined,
  ].filter((t) => {
    if (assignedBackupIds.has(t.teamId) || seen.has(t.teamId)) return false
    seen.add(t.teamId)
    return true
  })

  if (selection.alliances.length === 0) return null

  async function assign(allianceNumber: number, value: string) {
    const teamId = value === NO_BACKUP ? null : value
    try {
      const next = await setBackupFn({
        data: { eventId, allianceNumber, teamId },
      })
      onSelection(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">Backup robots</span>
        <span className="text-xs text-muted-foreground">
          Add a 4th team to an alliance.
        </span>
      </div>
      <div className="grid gap-2 @md/board:grid-cols-2">
        {selection.alliances.map((alliance) => {
          // this alliance's own current backup must appear in its own list
          const options = alliance.backup
            ? [alliance.backup, ...freePool]
            : freePool
          return (
            <div
              key={alliance.number}
              className="flex items-center gap-2 text-sm"
            >
              <span className="w-20 shrink-0 font-medium">
                Alliance {alliance.number}
              </span>
              <Select
                value={alliance.backup?.teamId ?? NO_BACKUP}
                onValueChange={(value) => assign(alliance.number, value)}
              >
                <SelectTrigger size="sm" className="flex-1">
                  <SelectValue placeholder="No backup" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BACKUP}>No backup</SelectItem>
                  {options.map((team) => (
                    <SelectItem key={team.teamId} value={team.teamId}>
                      {team.number} {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
