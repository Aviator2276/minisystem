import { useEffect, useRef, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { BracketGraphic } from "@/components/bracket/bracket-graphic"
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
import type { DisplayView } from "@/server/functions/display"
import { getDisplayBootstrap } from "@/server/functions/display"
import { allianceOrder } from "@/shared/alliance"
import type { Alliance } from "@/shared/alliance"
import { matchLongLabel } from "@/shared/match-format"
import { topicFor } from "@/shared/realtime-messages"
import type { ServerMessage } from "@/shared/realtime-messages"
import type { EnrichedSelectionState } from "@/server/services/selection"
import { MonitorPlayIcon } from "lucide-react"

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

  const order = allianceOrder(boot.event.flipAllianceSides)
  const current = matches.find((m) => m.id === field.matchId) ?? null
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
        if (next === "results" && armedRef.current && !preview) {
          const src = game.sounds["results"]
          if (src) void new Audio(src).play().catch(() => {})
        }
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
        if (armedRef.current && !preview) {
          const src = game.sounds[message.cue]
          if (src) void new Audio(src).play().catch(() => {})
        }
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
                order={order}
              />
            )}
            {view === "lineup" && (
              <LineupView
                label={current ? matchLabel(current) : "Next match"}
                current={current}
                teams={boot.teams}
                order={order}
              />
            )}
            {view === "rankings" && <RankingsView rankings={boot.rankings} />}
            {view === "selection" && (
              <div className="@container/board flex h-full flex-col gap-6 overflow-y-auto p-10">
                <h1 className="text-center text-4xl font-bold">
                  Alliance selection
                </h1>
                <SelectionBoard state={selection} dark showAvailable animated />
              </div>
            )}
            {view === "bracket" && (
              <div className="relative flex h-full flex-col gap-6 overflow-y-auto p-10">
                {boot.bracket.champion && (
                  <Confetti color="#facc15" count={70} />
                )}
                <h1 className="text-center text-4xl font-bold">
                  Playoff bracket
                </h1>
                <BracketGraphic bracket={boot.bracket} dark />
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
    blue1: string | null
    blue2: string | null
    blue3: string | null
  },
  teams: { teamId: string; number: number }[]
): number[] {
  if (match.winner !== "red" && match.winner !== "blue") return []
  const numbers = new Map(teams.map((t) => [t.teamId, t.number]))
  const ids =
    match.winner === "red"
      ? [match.red1, match.red2, match.red3]
      : [match.blue1, match.blue2, match.blue3]
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
          className="rounded-b px-4 py-0.5 text-xs font-bold tracking-widest text-white"
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
  order,
}: {
  label: string
  red: Totals
  blue: Totals
  winner: string | null
  winnerTeams: number[]
  order: readonly [Alliance, Alliance]
}) {
  const decided = winner === "red" || winner === "blue"
  // stage 1: winner reveal with confetti; stage 2: full score breakdown
  const [stage, setStage] = useState<"winner" | "breakdown">(
    decided ? "winner" : "breakdown"
  )

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
            <div className="flex items-center gap-10 text-7xl font-bold tabular-nums">
              <AnimatedNumber
                value={totals[leftSide]?.total ?? 0}
                style={{ color: `var(--alliance-${leftSide})` }}
              />
              <span className="text-3xl text-white/40">vs</span>
              <AnimatedNumber
                value={totals[rightSide]?.total ?? 0}
                style={{ color: `var(--alliance-${rightSide})` }}
              />
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

function LineupView({
  label,
  current,
  teams,
  order,
}: {
  label: string
  current: {
    red1: string | null
    red2: string | null
    red3: string | null
    blue1: string | null
    blue2: string | null
    blue3: string | null
  } | null
  teams: {
    teamId: string
    number: number
    name: string
    participants: string[]
  }[]
  order: readonly [Alliance, Alliance]
}) {
  const byId = new Map(teams.map((t) => [t.teamId, t]))
  const lineup = (ids: (string | null)[]) =>
    ids.map((id) => (id ? (byId.get(id) ?? null) : null))

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
      teams: lineup([
        current?.red1 ?? null,
        current?.red2 ?? null,
        current?.red3 ?? null,
      ]),
    },
    blue: {
      side: "blue",
      color: "var(--alliance-blue)",
      label: "Blue Alliance",
      teams: lineup([
        current?.blue1 ?? null,
        current?.blue2 ?? null,
        current?.blue3 ?? null,
      ]),
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
      <div className="grid w-full max-w-6xl grid-cols-2 gap-8">
        {sides.map(
          ({ side, color, label: sideLabel, slideFrom, teams: sideTeams }) => (
            <div key={side} className="flex flex-col gap-4">
              <motion.h2
                className="text-center text-2xl font-bold tracking-widest uppercase"
                style={{ color }}
                initial={{ opacity: 0, y: -14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                {sideLabel}
              </motion.h2>
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
                    <div className="truncate text-2xl font-semibold">
                      {team?.name ?? "Empty slot"}
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

function RankingsView({
  rankings,
}: {
  rankings: {
    teamId: string
    rank: number
    number: number
    name: string
    rp: number
    matchesPlayed: number
    wins: number
    losses: number
    ties: number
  }[]
}) {
  const { page, pageCount, start, end } = useRotatingPage(
    rankings.length,
    RANKINGS_PAGE_SIZE
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
                className="h-2 w-2 rounded-full transition-colors duration-300"
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
