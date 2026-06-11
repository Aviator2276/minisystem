import { useEffect, useMemo, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { BracketGraphic } from "@/components/bracket/bracket-graphic"
import { useRealtime } from "@/hooks/use-realtime"
import { getDisplayBootstrap } from "@/server/functions/display"
import { topicFor } from "@/shared/realtime-messages"

const PANEL_MS = 10_000

export const Route = createFileRoute("/public/$eventSlug/tv")({
  loader: ({ params }) =>
    getDisplayBootstrap({ data: { slug: params.eventSlug } }),
  component: TvMode,
})

type PanelId = "rankings" | "upnext" | "bracket" | "info"

function TvMode() {
  const boot = Route.useLoaderData()
  const router = useRouter()
  const [field, setField] = useState(boot.field)

  useRealtime([topicFor(boot.event.id, "public")], (message) => {
    if (message.type === "match_state") {
      setField((prev) => ({
        ...prev,
        matchId: message.matchId,
        phase: message.phase,
        phaseEndsAt: message.phaseEndsAt,
        running: message.phaseEndsAt !== null,
      }))
    }
    if (message.type === "score_update" || message.type === "bracket_update") {
      void router.invalidate()
    }
  })

  const panels = useMemo<PanelId[]>(() => {
    const list: PanelId[] = []
    if (boot.rankings.length > 0) list.push("rankings")
    list.push("upnext")
    if (boot.bracket.matches.length > 0) list.push("bracket")
    list.push("info")
    return list
  }, [boot.rankings.length, boot.bracket.matches.length])

  const [index, setIndex] = useState(0)
  useEffect(() => {
    const interval = setInterval(
      () => setIndex((i) => (i + 1) % panels.length),
      PANEL_MS
    )
    return () => clearInterval(interval)
  }, [panels.length])

  const panel = panels[index % panels.length]

  return (
    <main className="dark fixed inset-0 flex flex-col overflow-hidden bg-background font-mono text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-8 py-3">
        <span className="text-xl font-bold">{boot.event.name}</span>
        <div className="flex items-center gap-3">
          {panels.map((p, i) => (
            <div
              key={p}
              className={`size-2 rounded-full transition-colors duration-300 ${
                i === index % panels.length ? "bg-foreground" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </header>

      <div className="relative flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${panel}-${index}`}
            className="absolute inset-0 overflow-hidden p-10"
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -80 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            {panel === "rankings" && <TvRankings rankings={boot.rankings} />}
            {panel === "upnext" && (
              <TvUpNext
                matches={boot.matches}
                teams={boot.teams}
                currentMatchId={field.matchId}
                running={field.running}
              />
            )}
            {panel === "bracket" && (
              <Centered title="Playoff bracket">
                <BracketGraphic bracket={boot.bracket} dark />
              </Centered>
            )}
            {panel === "info" && (
              <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
                <motion.h1
                  className="text-7xl font-black"
                  initial={{ scale: 0.92 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.6 }}
                >
                  {boot.event.name}
                </motion.h1>
                <p className="text-3xl text-white/60 capitalize">
                  {boot.event.status.replace("_", " ")}
                </p>
                <p className="text-2xl text-white/40">
                  {boot.teams.length} teams · {boot.matches.length} matches
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  )
}

function Centered({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto">
      <h1 className="text-center text-4xl font-bold">{title}</h1>
      {children}
    </div>
  )
}

function TvRankings({
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
  return (
    <Centered title="Rankings">
      <table className="mx-auto w-full max-w-3xl text-2xl">
        <tbody>
          {rankings.slice(0, 10).map((row, i) => (
            <motion.tr
              key={row.teamId}
              className="odd:bg-white/5"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07 }}
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
    </Centered>
  )
}

function TvUpNext({
  matches,
  teams,
  currentMatchId,
  running,
}: {
  matches: {
    id: string
    type: string
    number: number
    status: string
    red1: string | null
    red2: string | null
    red3: string | null
    blue1: string | null
    blue2: string | null
    blue3: string | null
    redPoints: number | null
    bluePoints: number | null
  }[]
  teams: { teamId: string; number: number; name: string }[]
  currentMatchId: string | null
  running: boolean
}) {
  const numbers = new Map(teams.map((t) => [t.teamId, t.number]))
  const current = matches.find((m) => m.id === currentMatchId) ?? null
  const next =
    current && current.status !== "posted"
      ? current
      : (matches.find((m) => m.status === "scheduled") ?? null)
  const lastPosted = [...matches].reverse().find((m) => m.status === "posted")

  const label = (m: { type: string; number: number }) =>
    `${m.type === "qualification" ? "Qualification" : "Playoff"} ${m.number}`
  const lineup = (m: typeof next, side: "red" | "blue") =>
    m
      ? (side === "red"
          ? [m.red1, m.red2, m.red3]
          : [m.blue1, m.blue2, m.blue3]
        )
          .map((id) => (id ? (numbers.get(id) ?? "?") : "—"))
          .join("  ")
      : ""

  return (
    <div className="flex h-full flex-col items-center justify-center gap-10">
      {next ? (
        <>
          <motion.div
            className="text-2xl tracking-[0.4em] text-white/60 uppercase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {running && next.id === currentMatchId ? "Now playing" : "Up next"}
          </motion.div>
          <motion.h1
            className="text-6xl font-black"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 20 }}
          >
            {label(next)}
          </motion.h1>
          <div className="flex items-center gap-12 text-4xl font-bold tabular-nums">
            <motion.div
              className="flex flex-col items-center gap-2"
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <span style={{ color: "var(--alliance-red)" }}>RED</span>
              <span>{lineup(next, "red")}</span>
            </motion.div>
            <span className="text-2xl text-white/40">vs</span>
            <motion.div
              className="flex flex-col items-center gap-2"
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <span style={{ color: "var(--alliance-blue)" }}>BLUE</span>
              <span>{lineup(next, "blue")}</span>
            </motion.div>
          </div>
        </>
      ) : (
        <h1 className="text-5xl font-bold">All matches played</h1>
      )}
      {lastPosted && (
        <motion.p
          className="text-xl text-white/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Last result: {label(lastPosted)} — {lastPosted.redPoints}–
          {lastPosted.bluePoints}
        </motion.p>
      )}
    </div>
  )
}
