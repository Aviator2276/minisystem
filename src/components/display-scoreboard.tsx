import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { AnimatedNumber } from "@/components/animated-number"
import { Badge } from "@/components/ui/badge"
import { TOWER_STRENGTH, opponentTowerStrength } from "@/games/stronghold"
import type { StrongholdScore } from "@/games/stronghold"
import { useServerClock } from "@/hooks/use-server-clock"
import type { TimelineSegment } from "@/games/types"
import type { ServerMessage } from "@/shared/realtime-messages"

type Totals = Extract<ServerMessage, { type: "score_update" }>["red"]

export interface AllianceLive {
  totals: Totals
  state: StrongholdScore | null
}

const PHASE_COLORS: Record<string, string> = {
  auto: "bg-amber-500",
  pause: "bg-muted-foreground",
  teleop: "bg-emerald-600",
  endgame: "bg-yellow-400",
  post_match: "bg-red-600",
  fault: "bg-red-700",
}

function formatTime(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000)
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export function Scoreboard({
  label,
  teams,
  current,
  live,
  field,
  timeline,
}: {
  label: string
  teams: { teamId: string; number: number }[]
  current: {
    red1: string | null
    red2: string | null
    red3: string | null
    blue1: string | null
    blue2: string | null
    blue3: string | null
  } | null
  live: { red: AllianceLive; blue: AllianceLive }
  field: { phase: string; phaseEndsAt: number | null }
  timeline: TimelineSegment[]
}) {
  const clock = useServerClock()
  const [, force] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (field.phaseEndsAt === null) return
    const interval = setInterval(() => force((n) => n + 1), 100)
    return () => clearInterval(interval)
  }, [field.phaseEndsAt])

  const remainingMs =
    mounted && field.phaseEndsAt !== null
      ? Math.max(0, field.phaseEndsAt - clock.now())
      : null
  const currentSegment = timeline.find((p) => p.id === field.phase)
  const phaseLengthMs = currentSegment
    ? currentSegment.endMs - currentSegment.startMs
    : null
  const progressPct =
    remainingMs !== null && phaseLengthMs !== null
      ? (1 - remainingMs / phaseLengthMs) * 100
      : null

  const numbers = new Map(teams.map((t) => [t.teamId, t.number]))
  const teamsOf = (side: "red" | "blue") =>
    current
      ? (side === "red"
          ? [current.red1, current.red2, current.red3]
          : [current.blue1, current.blue2, current.blue3]
        ).map((id) => (id ? (numbers.get(id) ?? "?") : "—"))
      : ["—", "—", "—"]

  const phaseColor = PHASE_COLORS[field.phase] ?? "bg-muted"

  return (
    <div className="flex items-stretch overflow-hidden bg-card shadow-2xl">
      <AlliancePanel
        side="red"
        teams={teamsOf("red")}
        mine={live.red}
        opponent={live.blue}
      />
      <div className="flex w-48 flex-col items-center justify-center gap-0.5 border-x border-border px-3">
        <div className="text-center text-xs text-muted-foreground">{label}</div>
        <div className="relative h-1 w-full overflow-hidden bg-muted">
          {progressPct !== null && (
            <div
              className={`absolute inset-y-0 left-0 transition-[width] duration-100 ease-linear ${phaseColor}`}
              style={{ width: `${progressPct}%` }}
            />
          )}
        </div>
        {remainingMs !== null && (
          <div className="text-base font-bold text-card-foreground tabular-nums">
            {formatTime(remainingMs)}
          </div>
        )}
        <div className="flex items-center gap-2 text-4xl font-bold tabular-nums">
          <AnimatedNumber
            value={live.red.totals?.total ?? 0}
            className="text-[color:var(--alliance-red)]"
          />
          <span className="text-lg text-muted-foreground">–</span>
          <AnimatedNumber
            value={live.blue.totals?.total ?? 0}
            className="text-[color:var(--alliance-blue)]"
          />
        </div>
      </div>
      <AlliancePanel
        side="blue"
        teams={teamsOf("blue")}
        mine={live.blue}
        opponent={live.red}
      />
    </div>
  )
}

function AlliancePanel({
  side,
  teams,
  mine,
  opponent,
}: {
  side: "red" | "blue"
  teams: (number | string)[]
  mine: AllianceLive
  opponent: AllianceLive
}) {
  const color = side === "red" ? "var(--alliance-red)" : "var(--alliance-blue)"
  // this alliance's tower is depleted by the OPPONENT's boulders
  const tower = opponent.state
    ? opponentTowerStrength(opponent.state)
    : TOWER_STRENGTH
  // this alliance's own defenses are damaged by the opponent
  const defenses = opponent.state?.defenses ?? [2, 2, 2, 2, 2]
  const boulders = mine.state?.boulders

  return (
    <div
      className={`flex flex-1 items-center gap-4 px-4 ${side === "blue" ? "flex-row-reverse" : ""}`}
      style={{ borderTop: `4px solid ${color}` }}
    >
      <div className="flex flex-col gap-0.5">
        {teams.map((number, i) => (
          <div
            key={i}
            className="w-12 px-1.5 py-px text-center text-sm font-bold tabular-nums"
            style={{ backgroundColor: color }}
          >
            {number}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-xs tracking-widest text-muted-foreground uppercase">
          Tower
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: TOWER_STRENGTH }).map((_, i) => (
            <div
              key={i}
              className="h-3 w-4 transition-colors duration-300"
              style={{
                backgroundColor: i < tower ? color : "var(--muted)",
                opacity: i < tower ? 1 : 0.6,
              }}
            />
          ))}
        </div>
        <div className="text-xs tracking-widest text-muted-foreground uppercase">
          Defenses
        </div>
        <div className="flex gap-0.5">
          {defenses.map((strength, i) => (
            <div key={i} className="flex flex-col gap-px">
              {[1, 2].map((level) => (
                <div
                  key={level}
                  className="h-1.5 w-4 transition-colors duration-300"
                  style={{
                    backgroundColor:
                      strength >= level
                        ? "var(--card-foreground)"
                        : "var(--muted)",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 text-xs">
        <div>
          High{" "}
          <span className="font-bold tabular-nums">
            {(boulders?.autoHigh ?? 0) + (boulders?.teleHigh ?? 0)}
          </span>
        </div>
        <div>
          Low{" "}
          <span className="font-bold tabular-nums">
            {(boulders?.autoLow ?? 0) + (boulders?.teleLow ?? 0)}
          </span>
        </div>
        <div className="flex gap-1">
          <AnimatePresence>
            {mine.totals?.breach && (
              <motion.div
                key="breach"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 18 }}
              >
                <Badge variant="secondary">BREACH</Badge>
              </motion.div>
            )}
            {mine.totals?.capture && (
              <motion.div
                key="capture"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 18 }}
              >
                <Badge variant="secondary">CAPTURE</Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
