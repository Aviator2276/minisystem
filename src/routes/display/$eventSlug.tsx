import { Fragment, useEffect, useRef, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { BracketGraphic } from "@/components/bracket/bracket-graphic"
import { ScaleToFit } from "@/components/scale-to-fit"
import { ScheduleView } from "@/components/schedule-view"
import { SelectionBoard } from "@/components/selection-board"
import { AnimatedNumber } from "@/components/animated-number"
import { Confetti } from "@/components/display/confetti"
import { Button } from "@/components/ui/button"
import { Scoreboard } from "@/components/display-scoreboard"
import type { AllianceLive } from "@/components/display-scoreboard"
import { getGame } from "@/games"
import type { StrongholdScore } from "@/games/stronghold"
import { useRealtime } from "@/hooks/use-realtime"
import { RANKINGS_PAGE_SIZE, useRotatingPage } from "@/hooks/use-rotating-page"
import { cn } from "@/lib/utils"
import type { DisplayView } from "@/server/functions/display"
import { getDisplayBootstrap } from "@/server/functions/display"
import { allianceOrder } from "@/shared/alliance"
import type { Alliance } from "@/shared/alliance"
import { matchLongLabel } from "@/shared/match-format"
import { matchProgression } from "@/shared/playoff-progression"
import type { MatchProgression } from "@/shared/playoff-progression"
import { topicFor } from "@/shared/realtime-messages"
import { ROTATE_SLIDE_MS } from "@/shared/view-rotation"
import type { ServerMessage } from "@/shared/realtime-messages"
import type { EnrichedSelectionState } from "@/server/services/selection"
import {
  ArrowDownIcon,
  ArrowRightIcon,
  MonitorPlayIcon,
  TriangleAlertIcon,
  TrophyIcon,
  XCircleIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export const Route = createFileRoute("/display/$eventSlug")({
  validateSearch: (search: Record<string, unknown>): { preview?: boolean } => {
    // the router parses `?preview=1` as the number 1 (JSON.parse), so accept
    // every truthy spelling rather than just the string "1"
    const raw = search.preview
    const preview = raw === true || raw === 1 || raw === "1" || raw === "true"
    return { preview: preview ? true : undefined }
  },
  loader: ({ params }) =>
    getDisplayBootstrap({ data: { slug: params.eventSlug } }),
  component: DisplayScreen,
})

type Totals = Extract<ServerMessage, { type: "score_update" }>["red"]

interface BannerState {
  message: string
  variant: "info" | "warning" | "success"
  expiresAt: number | null
}

function allianceColor(side: "red" | "blue") {
  return side === "red" ? "var(--alliance-red)" : "var(--alliance-blue)"
}

/** height of the pinned lineup banner (px) — close to a view header's height */
const BANNER_H = 88

type AdvanceTone = "advance" | "drop" | "eliminated" | "champion"
interface AdvanceInfo {
  text: string
  tone: AdvanceTone
}

/**
 * Per-alliance post-match destination for the results screen: the winner's next
 * match (or championship), the loser's drop into the lower bracket, or their
 * elimination. Returns null outside decided playoff matches.
 */
function playoffAdvancement(
  progression: MatchProgression | null,
  winner: string | null,
  bracketCurrent: {
    redAllianceId: string | null
    blueAllianceId: string | null
  } | null,
  champion: { allianceId: string } | null
): Partial<Record<Alliance, AdvanceInfo>> | null {
  if (!progression || !bracketCurrent) return null
  if (winner !== "red" && winner !== "blue") return null
  const loserSide: Alliance = winner === "red" ? "blue" : "red"
  const winnerAllianceId =
    winner === "red"
      ? bracketCurrent.redAllianceId
      : bracketCurrent.blueAllianceId
  const isChampion =
    !!champion && !!winnerAllianceId && champion.allianceId === winnerAllianceId

  const out: Partial<Record<Alliance, AdvanceInfo>> = {}
  if (isChampion) out[winner] = { text: "Champions!", tone: "champion" }
  else if (progression.winner)
    out[winner] = {
      text: `Advances to: ${progression.winner.label}`,
      tone: "advance",
    }
  if (progression.isElimination)
    out[loserSide] = { text: "Eliminated", tone: "eliminated" }
  else if (progression.loser)
    out[loserSide] = {
      text: `Drops to: ${progression.loser.label}`,
      tone: "drop",
    }
  return Object.keys(out).length > 0 ? out : null
}

const ADVANCE_STYLE: Record<AdvanceTone, { cls: string; Icon: LucideIcon }> = {
  champion: {
    cls: "bg-yellow-400 text-black border-yellow-400",
    Icon: TrophyIcon,
  },
  advance: { cls: "border-emerald-400 text-emerald-300", Icon: ArrowRightIcon },
  drop: { cls: "border-amber-400 text-amber-300", Icon: ArrowDownIcon },
  eliminated: { cls: "border-red-500 text-red-300", Icon: XCircleIcon },
}

/** Animated post-match destination chip under an alliance on the results screen. */
function AdvancementBadge({ info }: { info: AdvanceInfo }) {
  const { cls, Icon } = ADVANCE_STYLE[info.tone]
  return (
    <motion.div
      className={cn(
        "mt-2 flex items-center justify-center gap-2 border px-4 py-1.5 text-base font-bold tracking-wide uppercase",
        cls
      )}
      initial={{ opacity: 0, y: 14, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.85, type: "spring", stiffness: 280, damping: 18 }}
    >
      <Icon className="size-4" />
      {info.text}
    </motion.div>
  )
}

function DisplayScreen() {
  const boot = Route.useLoaderData()
  const router = useRouter()
  const { preview } = Route.useSearch()
  const game = getGame(boot.event.gameId)
  const [selection, setSelection] = useState<EnrichedSelectionState>(
    boot.selection
  )

  const [armed, setArmed] = useState(preview)
  const [view, setView] = useState<DisplayView>(boot.event.displayView)
  const [field, setField] = useState(boot.field)
  const [matches, setMatches] = useState(boot.matches)
  const [banner, setBanner] = useState<BannerState | null>(null)
  const [borderFlash, setBorderFlash] = useState<
    "no_entry" | "safe_to_enter" | null
  >(null)
  // winner-colored sweep played when switching to results after a win
  const [sweep, setSweep] = useState<{
    side: "red" | "blue"
    id: number
  } | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const armedRef = useRef(armed)
  armedRef.current = armed

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    },
    []
  )

  // re-sync the schedule when the loader refetches (e.g. after playoff matches
  // are generated): score_update only patches existing rows, so newly created
  // matches reach the display only through a fresh loader payload
  useEffect(() => {
    setMatches(boot.matches)
  }, [boot.matches])

  // Preload + reuse one Audio element per cue. Creating a fresh `new Audio()`
  // on every play has to fetch and decode the file first — that's the lag on
  // the results sound. Once armed (a user gesture has unlocked audio) we load
  // them all, then playback just rewinds and plays instantly.
  const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  useEffect(() => {
    if (!armed || preview) return
    for (const [cue, src] of Object.entries(game.sounds)) {
      if (!src || audioCacheRef.current.has(cue)) continue
      const audio = new Audio(src)
      audio.preload = "auto"
      audio.load()
      audioCacheRef.current.set(cue, audio)
    }
  }, [armed, preview, game])

  function playSound(cue: string) {
    if (!armedRef.current || preview) return
    const src = game.sounds[cue]
    if (!src) return
    const cached = audioCacheRef.current.get(cue)
    if (cached) {
      cached.currentTime = 0
      void cached.play().catch(() => {})
    } else {
      void new Audio(src).play().catch(() => {})
    }
  }

  const order = allianceOrder(boot.event.flipAllianceSides)
  const current = matches.find((m) => m.id === field.matchId) ?? null

  // during playoffs, surface each side's alliance number (from the bracket) on
  // the lineup + results screens; null for quals/practice (no alliances)
  const bracketCurrent =
    boot.bracket.matches.find((m) => m.id === current?.id) ?? null
  const allianceNumbers = bracketCurrent
    ? {
        red: bracketCurrent.redAllianceNumber,
        blue: bracketCurrent.blueAllianceNumber,
      }
    : null

  // playoff stakes: where each alliance goes after this match. Drives the
  // lineup's elimination banner and the results screen's advancement footer.
  const progression =
    current?.type === "playoff"
      ? matchProgression(boot.bracket.matches, bracketCurrent?.bracketSlot)
      : null
  const eliminationBanner = progression?.isElimination
    ? { isFinal: progression.isFinal }
    : null
  const advancement = playoffAdvancement(
    progression,
    current?.winner ?? null,
    bracketCurrent,
    boot.bracket.champion
  )

  // event-specific high score: the best single-alliance score from every OTHER
  // posted match. The shown results match sets a new record when its top
  // alliance beats it — that alliance gets the highlight + confetti.
  const prevEventHigh = Math.max(
    0,
    ...matches
      .filter((m) => m.status === "posted" && m.id !== current?.id)
      .flatMap((m) => [m.redPoints ?? 0, m.bluePoints ?? 0])
  )
  const recordSide: Alliance | null =
    current?.status === "posted" &&
    Math.max(current.redPoints ?? 0, current.bluePoints ?? 0) > prevEventHigh
      ? (current.redPoints ?? 0) >= (current.bluePoints ?? 0)
        ? "red"
        : "blue"
      : null
  const [live, setLive] = useState<{ red: AllianceLive; blue: AllianceLive }>(
    () => ({
      red: cachedSide(current?.redScore),
      blue: cachedSide(current?.blueScore),
    })
  )

  useEffect(() => {
    setLive({
      red: cachedSide(current?.redScore),
      blue: cachedSide(current?.blueScore),
    })
  }, [field.matchId])

  // "Auto rotate views" is driven server-side: the rotator advances
  // events.displayView and broadcasts view_change, which lands in `view` via the
  // handler below — so the cycle, the control-panel highlight, and this screen
  // all stay in sync. Here we only react to `view`.

  // "Always show lineup": pin a lineup banner across the rankings/schedule/
  // bracket views (only when a match is queued to read teams from)
  const showLineupBanner =
    boot.event.alwaysShowLineup &&
    current !== null &&
    (view === "rankings" || view === "schedule" || view === "bracket")

  useRealtime([topicFor(boot.event.id, "public")], (message) => {
    switch (message.type) {
      case "match_state":
        setField((prev) => ({
          ...prev,
          matchId: message.matchId,
          phase: message.phase,
          phaseEndsAt: message.phaseEndsAt,
          running: message.phaseEndsAt !== null,
        }))
        // a new phase supersedes a sticky banner
        setBanner((prev) => (prev?.expiresAt === null ? null : prev))
        if (message.phase === "no_entry" || message.phase === "safe_to_enter") {
          setBorderFlash(message.phase)
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
          flashTimerRef.current = setTimeout(() => setBorderFlash(null), 3000)
        }
        break
      case "score_update":
        setLive({
          red: {
            totals: message.red,
            state: (message.redState as StrongholdScore | null) ?? null,
          },
          blue: {
            totals: message.blue,
            state: (message.blueState as StrongholdScore | null) ?? null,
          },
        })
        setMatches((prev) =>
          prev.map((m) =>
            m.id === message.matchId
              ? {
                  ...m,
                  status: message.status as typeof m.status,
                  winner: (message.winner as typeof m.winner) ?? null,
                  redPoints: message.red?.total ?? null,
                  bluePoints: message.blue?.total ?? null,
                }
              : m
          )
        )
        break
      case "view_change": {
        const next = message.view as DisplayView
        // contextual transition: results after a decided match sweeps in the
        // winner's color; everything else crossfades
        if (next === "results" && view !== "results") {
          const winner = current?.winner
          if (winner === "red" || winner === "blue") {
            setSweep({ side: winner, id: Date.now() })
          }
        }
        setView(next)
        if (next === "results") playSound("results")
        break
      }
      case "selection_update":
        setSelection(message.payload as EnrichedSelectionState)
        break
      case "bracket_update":
        void router.invalidate() // bracket rides the loader; refetch it
        break
      case "settings_update":
        void router.invalidate() // alliance order rides the loader too
        break
      case "cards_update":
        void router.invalidate() // team card graphics ride the loader
        break
      case "rankings_update":
        void router.invalidate() // rankings (incl. ranking points) ride the loader
        break
      case "toast":
        if (
          message.message !== "Do not enter the field" &&
          message.message !== "Safe to enter the field"
        ) {
          setBanner({
            message: message.message,
            variant: message.variant,
            expiresAt:
              message.durationMs === null
                ? null
                : Date.now() + message.durationMs,
          })
        }
        break
      case "sound":
        playSound(message.cue)
        break
    }
  })

  // timed banners dismiss themselves
  useEffect(() => {
    if (!banner?.expiresAt) return
    const t = setTimeout(() => setBanner(null), banner.expiresAt - Date.now())
    return () => clearTimeout(t)
  }, [banner])

  if (!armed) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-black text-white">
        <motion.h1
          className="text-4xl font-bold"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {boot.event.name}
        </motion.h1>
        <p className="text-muted-foreground">MiniSystem display</p>
        <Button size="lg" onClick={() => setArmed(true)}>
          <MonitorPlayIcon />
          Start display
        </Button>
        <p className="max-w-sm text-center text-xs text-white/50">
          Starting enables the camera and match sounds — browsers require a
          click before either can play.
        </p>
      </main>
    )
  }

  const cameraVisible = view === "match" || view === "camera"

  return (
    <main className="dark fixed inset-0 flex flex-col overflow-hidden bg-background font-mono text-foreground">
      <FieldBorder phase={field.phase} flashPhase={borderFlash} />

      <div className="relative flex-1">
        {/* persistent camera layer: never remounts, so the stream survives view switches */}
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: cameraVisible ? 1 : 0 }}
          transition={{ duration: 0.45 }}
        >
          <CameraFeed enabled={!preview} />
        </motion.div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            className="absolute inset-0"
            style={{ paddingTop: showLineupBanner ? BANNER_H : undefined }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {view === "results" && current && (
              <ResultsView
                label={matchLabel(current)}
                red={live.red.totals}
                blue={live.blue.totals}
                winner={current.winner}
                winnerTeams={winnerTeamNumbers(current, boot.teams)}
                current={current}
                teams={boot.teams}
                recordSide={recordSide}
                order={order}
                allianceNumbers={allianceNumbers}
                advancement={advancement}
              />
            )}
            {view === "lineup" && (
              <LineupView
                label={current ? matchLabel(current) : "Next match"}
                current={current}
                teams={boot.teams}
                order={order}
                allianceNumbers={allianceNumbers}
                eliminationBanner={eliminationBanner}
              />
            )}
            {view === "rankings" && (
              <RankingsView
                rankings={boot.rankings}
                pageMs={
                  boot.event.autoRotateViews ? ROTATE_SLIDE_MS : undefined
                }
              />
            )}
            {view === "selection" && (
              <div className="@container/board flex h-full flex-col gap-6 overflow-y-auto p-10">
                <h1 className="text-center text-4xl font-bold">
                  Alliance selection
                </h1>
                <SelectionBoard state={selection} dark showAvailable animated />
              </div>
            )}
            {view === "bracket" && (
              <div className="relative flex h-full flex-col gap-4 overflow-hidden p-6">
                {boot.bracket.champion && (
                  <Confetti color="#facc15" count={70} />
                )}
                <h1 className="shrink-0 text-center text-4xl font-bold">
                  Playoff bracket
                </h1>
                <ScaleToFit className="flex-1">
                  <BracketGraphic
                    bracket={boot.bracket}
                    dark
                    currentMatchId={field.matchId}
                  />
                </ScaleToFit>
              </div>
            )}
            {view === "schedule" && (
              <div className="flex h-full flex-col justify-center gap-8 p-10">
                <h1 className="shrink-0 text-center text-4xl font-bold">
                  Schedule
                </h1>
                <ScheduleView
                  matches={matches}
                  teams={boot.teams}
                  currentMatchId={field.matchId}
                  order={order}
                  dark
                />
              </div>
            )}
            {view === "intermission" && (
              <div className="flex h-full flex-col items-center justify-center gap-4">
                <motion.h1
                  className="text-6xl font-bold"
                  animate={{ y: [0, -10, 0] }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  {boot.event.name}
                </motion.h1>
                <p className="text-2xl text-white/60">Matches resume shortly</p>
              </div>
            )}

            {view === "match" && (
              <motion.div
                className="absolute inset-x-6 bottom-6"
                initial={{ y: 90, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 240, damping: 26 }}
              >
                <Scoreboard
                  label={current ? matchLabel(current) : "—"}
                  teams={boot.teams}
                  current={current}
                  live={live}
                  field={field}
                  timeline={game.timeline}
                  order={order}
                />
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* pinned lineup banner across rankings/schedule/bracket */}
        <AnimatePresence>
          {showLineupBanner && (
            <LineupBanner
              current={current}
              teams={boot.teams}
              order={order}
              allianceNumbers={allianceNumbers}
            />
          )}
        </AnimatePresence>

        {/* winner-colored sweep on the way into results */}
        <AnimatePresence>
          {sweep && (
            <motion.div
              key={sweep.id}
              className="pointer-events-none absolute inset-0 z-40"
              style={{
                background: `linear-gradient(100deg, transparent 8%, ${allianceColor(sweep.side)} 30%, ${allianceColor(sweep.side)} 70%, transparent 92%)`,
              }}
              initial={{ x: "-130%" }}
              animate={{ x: "130%" }}
              transition={{ duration: 0.95, ease: [0.76, 0, 0.24, 1] }}
              onAnimationComplete={() => setSweep(null)}
            />
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.message}
            className={`absolute top-24 left-1/2 z-50 px-10 py-5 text-3xl font-bold shadow-2xl ${
              banner.variant === "warning"
                ? "bg-red-600"
                : banner.variant === "success"
                  ? "bg-emerald-600"
                  : "bg-sky-600"
            }`}
            initial={{ opacity: 0, y: -48, x: "-50%", scale: 0.9 }}
            animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
            exit={{ opacity: 0, y: -24, x: "-50%" }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
          >
            {banner.message}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}

function cachedSide(cache: unknown): AllianceLive {
  const parsed = cache as { totals?: Totals; state?: StrongholdScore } | null
  return { totals: parsed?.totals ?? null, state: parsed?.state ?? null }
}

const matchLabel = matchLongLabel

function winnerTeamNumbers(
  match: {
    winner: string | null
    red1: string | null
    red2: string | null
    red3: string | null
    red4: string | null
    blue1: string | null
    blue2: string | null
    blue3: string | null
    blue4: string | null
  },
  teams: { teamId: string; number: number }[]
): number[] {
  if (match.winner !== "red" && match.winner !== "blue") return []
  const numbers = new Map(teams.map((t) => [t.teamId, t.number]))
  const ids =
    match.winner === "red"
      ? [match.red1, match.red2, match.red3, match.red4]
      : [match.blue1, match.blue2, match.blue3, match.blue4]
  return ids.flatMap((id) => {
    const n = id ? numbers.get(id) : undefined
    return n === undefined ? [] : [n]
  })
}

function FieldBorder({
  phase,
  flashPhase,
}: {
  phase: string
  flashPhase: "no_entry" | "safe_to_enter" | null
}) {
  const isSafe = phase === "safe_to_enter"
  const notchColor = isSafe ? "#22c55e" : "#dc2626"
  const notchLabel = isSafe ? "SAFE TO ENTER" : "DO NOT ENTER FIELD"

  const flashIsSafe = flashPhase === "safe_to_enter"
  const borderColor = flashIsSafe ? "#4ade80" : "#ff2222"

  return (
    <>
      <div className="pointer-events-none fixed top-0 left-1/2 z-50 -translate-x-1/2">
        <motion.div
          className="px-4 py-0.5 text-xs font-bold tracking-widest text-white"
          animate={{ backgroundColor: notchColor }}
          transition={{ duration: 0.4 }}
        >
          {notchLabel}
        </motion.div>
      </div>
      {flashPhase && (
        <div
          className="pointer-events-none fixed inset-0 z-40 animate-pulse"
          style={{
            boxShadow: `inset 0 0 0 5px ${borderColor}, inset 0 0 40px ${borderColor}60`,
          }}
        />
      )}
    </>
  )
}

function CameraFeed({ enabled }: { enabled: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!enabled) return
    let stream: MediaStream | undefined
    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      .then((s) => {
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
      })
      .catch(() => {})
    return () => stream?.getTracks().forEach((track) => track.stop())
  }, [enabled])

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="absolute inset-0 size-full -scale-x-100 object-cover"
    />
  )
}

function ResultsView({
  label,
  red,
  blue,
  winner,
  winnerTeams,
  current,
  teams,
  recordSide,
  order,
  allianceNumbers,
  advancement,
}: {
  label: string
  red: Totals
  blue: Totals
  winner: string | null
  winnerTeams: number[]
  current: {
    red1: string | null
    red2: string | null
    red3: string | null
    red4: string | null
    blue1: string | null
    blue2: string | null
    blue3: string | null
    blue4: string | null
  }
  teams: { teamId: string; number: number; name: string }[]
  recordSide: Alliance | null
  order: readonly [Alliance, Alliance]
  allianceNumbers: Record<Alliance, number | null> | null
  advancement: Partial<Record<Alliance, AdvanceInfo>> | null
}) {
  const decided = winner === "red" || winner === "blue"
  // stage 1: winner reveal with confetti; stage 2: full score breakdown
  const [stage, setStage] = useState<"winner" | "breakdown">(
    decided ? "winner" : "breakdown"
  )

  const byId = new Map(teams.map((t) => [t.teamId, t]))
  const teamsOf = (side: Alliance) =>
    (side === "red"
      ? [current.red1, current.red2, current.red3, current.red4]
      : [current.blue1, current.blue2, current.blue3, current.blue4]
    )
      .map((id) => (id ? (byId.get(id) ?? null) : null))
      .filter((t): t is (typeof teams)[number] => t !== null)

  useEffect(() => {
    if (stage !== "winner") return
    const t = setTimeout(() => setStage("breakdown"), 3200)
    return () => clearTimeout(t)
  }, [stage])

  const winColor = decided ? allianceColor(winner) : "var(--card-foreground)"

  const [leftSide, rightSide] = order
  const totals = { red, blue }
  const rows: [string, Record<Alliance, number>][] = [
    ["Auto", { red: red?.auto ?? 0, blue: blue?.auto ?? 0 }],
    ["Teleop", { red: red?.teleop ?? 0, blue: blue?.teleop ?? 0 }],
    ["Endgame", { red: red?.endgame ?? 0, blue: blue?.endgame ?? 0 }],
    ["Penalty", { red: red?.penalty ?? 0, blue: blue?.penalty ?? 0 }],
    ["Bonus", { red: red?.bonus ?? 0, blue: blue?.bonus ?? 0 }],
  ]

  return (
    <div className="relative h-full">
      {decided && <Confetti color={winColor} />}
      {/* a new event high score gets its own golden celebration */}
      {stage === "breakdown" && recordSide && (
        <Confetti color="#facc15" count={90} />
      )}

      <AnimatePresence mode="wait">
        {stage === "winner" && decided ? (
          <motion.div
            key="winner"
            className="flex h-full flex-col items-center justify-center gap-6"
            exit={{ opacity: 0, scale: 1.06 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              className="text-2xl tracking-[0.4em] text-white/60 uppercase"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              {label}
            </motion.div>
            <motion.div
              className="text-8xl font-black tracking-tight"
              style={{ color: winColor }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 16 }}
            >
              {winner.toUpperCase()} ALLIANCE
            </motion.div>
            <motion.div
              className="text-4xl font-bold text-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
            >
              WINS THE MATCH
            </motion.div>
            {allianceNumbers?.[winner] != null && (
              <motion.div
                className="px-4 py-1 text-2xl font-black tracking-wider text-white uppercase tabular-nums"
                style={{ backgroundColor: winColor }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
              >
                Alliance {allianceNumbers[winner]}
              </motion.div>
            )}
            <div className="flex gap-3">
              {winnerTeams.map((number, i) => (
                <motion.div
                  key={number}
                  className="px-5 py-2 text-3xl font-bold text-white tabular-nums"
                  style={{ backgroundColor: winColor }}
                  initial={{ opacity: 0, y: 26, scale: 0.7 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: 0.65 + i * 0.15,
                    type: "spring",
                    stiffness: 300,
                    damping: 18,
                  }}
                >
                  {number}
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="breakdown"
            className="flex h-full flex-col items-center justify-center gap-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.h1
              className="text-4xl font-bold"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {label} results
            </motion.h1>
            <div className="text-3xl font-bold">
              {winner === "tie" ? (
                "TIE"
              ) : decided ? (
                <span style={{ color: winColor }}>
                  {winner.toUpperCase()} WINS
                </span>
              ) : (
                "Pending"
              )}
            </div>
            <div className="flex items-center justify-center gap-6">
              {order.map((side, idx) => {
                const isRecord = recordSide === side
                const sideColor = `var(--alliance-${side})`
                const sideAdvance = advancement?.[side]
                return (
                  <Fragment key={side}>
                    {idx > 0 && (
                      <span className="text-3xl text-white/40">vs</span>
                    )}
                    <motion.div
                      className={`flex flex-col items-center gap-3 px-6 py-4 ${
                        isRecord
                          ? "bg-yellow-400/10 ring-2 ring-yellow-400"
                          : ""
                      }`}
                      initial={{ opacity: 0, y: 24, scale: 0.92 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        delay: 0.15 + idx * 0.12,
                        type: "spring",
                        stiffness: 220,
                        damping: 20,
                      }}
                    >
                      {allianceNumbers?.[side] != null && (
                        <motion.div
                          className="px-3 py-0.5 text-base font-black tracking-wider text-white uppercase tabular-nums"
                          style={{ backgroundColor: sideColor }}
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            delay: 0.25 + idx * 0.12,
                            type: "spring",
                            stiffness: 280,
                            damping: 16,
                          }}
                        >
                          Alliance {allianceNumbers[side]}
                        </motion.div>
                      )}
                      {isRecord && (
                        <motion.div
                          className="bg-yellow-400 px-3 py-1 text-sm font-black tracking-wider text-black uppercase"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            delay: 0.55,
                            type: "spring",
                            stiffness: 300,
                            damping: 13,
                          }}
                        >
                          ★ New high score
                        </motion.div>
                      )}
                      <AnimatedNumber
                        value={totals[side]?.total ?? 0}
                        className="text-7xl font-bold tabular-nums"
                        style={{ color: sideColor }}
                      />
                      <div className="flex flex-col gap-1.5">
                        {teamsOf(side).map((team, i) => (
                          <motion.div
                            key={team.teamId}
                            className="flex items-center gap-3"
                            initial={{ opacity: 0, x: idx === 0 ? -24 : 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.4 + i * 0.1 }}
                          >
                            <span
                              className="min-w-12 text-right text-2xl font-bold tabular-nums"
                              style={{ color: sideColor }}
                            >
                              {team.number}
                            </span>
                            <span className="max-w-64 truncate text-lg text-white/85">
                              {team.name}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                      {sideAdvance && <AdvancementBadge info={sideAdvance} />}
                    </motion.div>
                  </Fragment>
                )
              })}
            </div>
            <table className="text-xl">
              <tbody>
                {rows.map(([name, values], i) => (
                  <motion.tr
                    key={name}
                    initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.12 }}
                  >
                    <td
                      className="px-6 text-right tabular-nums"
                      style={{ color: `var(--alliance-${leftSide})` }}
                    >
                      {values[leftSide]}
                    </td>
                    <td className="px-6 text-center text-white/60">{name}</td>
                    <td
                      className="px-6 tabular-nums"
                      style={{ color: `var(--alliance-${rightSide})` }}
                    >
                      {values[rightSide]}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Animated playoff stakes banner shown on the lineup screen: a pulsing warning
 * that the losing alliance is eliminated (gold "grand final" styling when it's
 * the championship match).
 */
function EliminationBanner({ isFinal }: { isFinal: boolean }) {
  const Icon = isFinal ? TrophyIcon : TriangleAlertIcon
  const tint = isFinal ? "#facc15" : "#ef4444"
  return (
    <motion.div
      className="flex items-center gap-4 border-2 px-10 py-3 text-2xl font-black tracking-widest uppercase"
      style={{
        borderColor: tint,
        color: isFinal ? "#facc15" : "#fca5a5",
        background: `color-mix(in oklch, ${tint} 14%, transparent)`,
      }}
      initial={{ opacity: 0, scale: 0.5, y: -12 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: 0,
        boxShadow: [
          `0 0 0px ${tint}00`,
          `0 0 28px ${tint}88`,
          `0 0 0px ${tint}00`,
        ],
      }}
      transition={{
        opacity: { duration: 0.3, delay: 0.15 },
        scale: { type: "spring", stiffness: 260, damping: 16, delay: 0.15 },
        boxShadow: { duration: 1.8, repeat: Infinity, ease: "easeInOut" },
      }}
    >
      <motion.span
        animate={{ scale: [1, 1.18, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Icon className="size-7" />
      </motion.span>
      {isFinal ? "Grand Finale" : "Elimination Match"}
    </motion.div>
  )
}

function LineupView({
  label,
  current,
  teams,
  order,
  allianceNumbers,
  eliminationBanner,
}: {
  label: string
  current: {
    red1: string | null
    red2: string | null
    red3: string | null
    red4: string | null
    blue1: string | null
    blue2: string | null
    blue3: string | null
    blue4: string | null
  } | null
  teams: {
    teamId: string
    number: number
    name: string
    participants: string[]
  }[]
  order: readonly [Alliance, Alliance]
  allianceNumbers: Record<Alliance, number | null> | null
  eliminationBanner: { isFinal: boolean } | null
}) {
  const byId = new Map(teams.map((t) => [t.teamId, t]))
  const lineup = (ids: (string | null)[]) =>
    ids.map((id) => (id ? (byId.get(id) ?? null) : null))
  // include the backup robot as a 4th row only when one is assigned
  const rosterIds = (base: (string | null)[], backup: string | null) =>
    backup ? [...base, backup] : base

  const sideConfig: Record<
    Alliance,
    {
      side: Alliance
      color: string
      label: string
      teams: ReturnType<typeof lineup>
    }
  > = {
    red: {
      side: "red",
      color: "var(--alliance-red)",
      label: "Red Alliance",
      teams: lineup(
        rosterIds(
          [current?.red1 ?? null, current?.red2 ?? null, current?.red3 ?? null],
          current?.red4 ?? null
        )
      ),
    },
    blue: {
      side: "blue",
      color: "var(--alliance-blue)",
      label: "Blue Alliance",
      teams: lineup(
        rosterIds(
          [
            current?.blue1 ?? null,
            current?.blue2 ?? null,
            current?.blue3 ?? null,
          ],
          current?.blue4 ?? null
        )
      ),
    },
  }
  // left slides in from the left, right from the right
  const sides = order.map((s, idx) => ({
    ...sideConfig[s],
    slideFrom: idx === 0 ? -70 : 70,
  }))

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-10">
      <motion.h1
        className="text-4xl font-bold"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {label}
      </motion.h1>
      {eliminationBanner && (
        <EliminationBanner isFinal={eliminationBanner.isFinal} />
      )}
      <div className="grid w-full max-w-6xl grid-cols-2 gap-8">
        {sides.map(
          ({ side, color, label: sideLabel, slideFrom, teams: sideTeams }) => (
            <div key={side} className="flex flex-col gap-4">
              <motion.div
                className="flex flex-col items-center gap-1"
                initial={{ opacity: 0, y: -14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                {allianceNumbers?.[side] != null && (
                  <span
                    className="px-3 py-0.5 text-2xl font-black tracking-wider text-white uppercase tabular-nums"
                    style={{ backgroundColor: color }}
                  >
                    Alliance {allianceNumbers[side]}
                  </span>
                )}
                <h2
                  className="text-center text-2xl font-bold tracking-widest uppercase"
                  style={{ color }}
                >
                  {sideLabel}
                </h2>
              </motion.div>
              {sideTeams.map((team, i) => (
                <motion.div
                  key={i}
                  className="flex items-center gap-5 bg-white/5 p-5"
                  style={{ borderLeft: `6px solid ${color}` }}
                  initial={{ opacity: 0, x: slideFrom }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: 0.25 + i * 0.15,
                    type: "spring",
                    stiffness: 220,
                    damping: 22,
                  }}
                >
                  <div
                    className="min-w-20 text-center text-4xl font-bold tabular-nums"
                    style={{ color }}
                  >
                    {team?.number ?? "—"}
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-2xl font-semibold">
                        {team?.name ?? "Empty slot"}
                      </span>
                      {sideTeams.length === 4 && i === 3 && (
                        <span
                          className="shrink-0 px-1.5 py-0.5 text-xs font-bold tracking-wide uppercase"
                          style={{ color, border: `1px solid ${color}` }}
                        >
                          Backup
                        </span>
                      )}
                    </div>
                    {team && team.participants.length > 0 && (
                      <div className="truncate text-base text-white/60">
                        {team.participants.join(" · ")}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

/**
 * Pinned banner showing both alliances' lineups across the rankings/schedule/
 * bracket views. Behaves like the safe-to-enter notch but spans a header-sized
 * strip: the left alliance (per `order`, so flip-aware) sits left, the other
 * right, each color-tinted with its team numbers animating in.
 */
function LineupBanner({
  current,
  teams,
  order,
  allianceNumbers,
}: {
  current: {
    red1: string | null
    red2: string | null
    red3: string | null
    red4: string | null
    blue1: string | null
    blue2: string | null
    blue3: string | null
    blue4: string | null
  }
  teams: { teamId: string; number: number }[]
  order: readonly [Alliance, Alliance]
  allianceNumbers: Record<Alliance, number | null> | null
}) {
  const numberOf = new Map(teams.map((t) => [t.teamId, t.number]))
  const numbersFor = (side: Alliance) =>
    (side === "red"
      ? [current.red1, current.red2, current.red3, current.red4]
      : [current.blue1, current.blue2, current.blue3, current.blue4]
    ).flatMap((id) => {
      const n = id ? numberOf.get(id) : undefined
      return n === undefined ? [] : [n]
    })

  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 grid grid-cols-2"
      style={{ height: BANNER_H }}
      initial={{ y: "-110%" }}
      animate={{ y: 0 }}
      exit={{ y: "-110%" }}
      transition={{ type: "spring", stiffness: 210, damping: 26 }}
    >
      {order.map((side, idx) => {
        const color = allianceColor(side)
        const numbers = numbersFor(side)
        const allianceNumber = allianceNumbers?.[side] ?? null
        const label = (
          <span
            className="text-2xl font-black tracking-widest uppercase"
            style={{ color }}
          >
            {side}
            {allianceNumber != null && (
              <span className="ml-2 text-xl tabular-nums">
                A{allianceNumber}
              </span>
            )}
          </span>
        )
        const nums = (
          <div className="flex items-center gap-5">
            {numbers.map((n, i) => (
              <motion.span
                key={n}
                className="text-4xl font-black tabular-nums"
                style={{ color }}
                initial={{ opacity: 0, y: -18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 + i * 0.08 }}
              >
                {n}
              </motion.span>
            ))}
          </div>
        )
        return (
          <div
            key={side}
            className={cn(
              "flex h-full items-center gap-6 px-12",
              idx === 0 ? "justify-start" : "justify-end"
            )}
            style={{
              background: `linear-gradient(${idx === 0 ? "90deg" : "270deg"}, color-mix(in oklch, ${color} 32%, transparent), transparent)`,
              boxShadow: `inset 0 4px 0 0 ${color}`,
            }}
          >
            {idx === 0 ? (
              <>
                {label}
                {nums}
              </>
            ) : (
              <>
                {nums}
                {label}
              </>
            )}
          </div>
        )
      })}
    </motion.div>
  )
}

function RankingsView({
  rankings,
  pageMs,
}: {
  rankings: {
    teamId: string
    rank: number
    number: number
    name: string
    rankingPoints: number
    rp: number
    matchesPlayed: number
    wins: number
    losses: number
    ties: number
  }[]
  pageMs?: number
}) {
  const { page, pageCount, start, end } = useRotatingPage(
    rankings.length,
    RANKINGS_PAGE_SIZE,
    pageMs
  )
  const visible = rankings.slice(start, end)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-10">
      <motion.h1
        className="text-4xl font-bold"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Rankings
      </motion.h1>
      <table className="w-full max-w-3xl text-2xl">
        <thead className="text-base tracking-widest text-white/50 uppercase">
          <tr>
            <th className="px-4 py-1 text-left">#</th>
            <th className="px-4 py-1 text-left">Team</th>
            <th className="px-4 py-1 text-right">Ranking pts</th>
            <th className="px-4 py-1 text-right">Avg RP</th>
            <th className="px-4 py-1 text-right">W-L-T</th>
          </tr>
        </thead>
        <tbody key={page}>
          {visible.map((row, i) => (
            <motion.tr
              key={row.teamId}
              className="odd:bg-white/5"
              initial={{ opacity: 0, y: 44 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.15 + i * 0.09,
                type: "spring",
                stiffness: 240,
                damping: 24,
              }}
            >
              <td className="px-4 py-1 font-bold tabular-nums">{row.rank}</td>
              <td className="px-4 py-1">
                <span className="font-bold tabular-nums">{row.number}</span>{" "}
                {row.name}
              </td>
              <td className="px-4 py-1 text-right font-bold tabular-nums">
                {row.rankingPoints}
              </td>
              <td className="px-4 py-1 text-right tabular-nums">
                {row.matchesPlayed > 0
                  ? (row.rp / row.matchesPlayed).toFixed(2)
                  : "0.00"}
              </td>
              <td className="px-4 py-1 text-right tabular-nums">
                {row.wins}-{row.losses}-{row.ties}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      {pageCount > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-lg text-white/50 tabular-nums">
            Ranks {start + 1}–{Math.min(end, rankings.length)} of{" "}
            {rankings.length}
          </span>
          <div className="flex gap-1.5">
            {Array.from({ length: pageCount }).map((_, i) => (
              <div
                key={i}
                className="h-2 w-2 transition-colors duration-300"
                style={{
                  backgroundColor:
                    i === page ? "white" : "rgb(255 255 255 / 0.25)",
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
