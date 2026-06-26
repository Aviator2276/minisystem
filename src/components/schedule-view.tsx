import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"
import type { Alliance } from "@/shared/alliance"
import { matchLongLabel, sortMatchesByType } from "@/shared/match-format"

/** the slice of a match row the schedule needs (a subset of listMatches rows) */
export interface ScheduleMatch {
  id: string
  type: string
  number: number
  bracketSlot?: string | null
  scheduledOrder: number
  status: string
  red1: string | null
  red2: string | null
  red3: string | null
  red4: string | null
  blue1: string | null
  blue2: string | null
  blue3: string | null
  blue4: string | null
  redPoints: number | null
  bluePoints: number | null
}

interface ScheduleTeam {
  teamId: string
  number: number
}

/**
 * A rolling 5-match schedule centered on the current match: one played match
 * for reference, the current match (green, pulsing), the next match (yellow),
 * and the two after it. Animates as the field advances. Shared by the arena
 * display and the TV rotation.
 */
export function ScheduleView({
  matches,
  teams,
  currentMatchId,
  order,
  dark = false,
}: {
  matches: ScheduleMatch[]
  teams: ScheduleTeam[]
  currentMatchId: string | null
  order: readonly [Alliance, Alliance]
  dark?: boolean
}) {
  const numbers = new Map(teams.map((t) => [t.teamId, t.number]))
  const queue = sortMatchesByType(matches)

  const currentIndex = queue.findIndex((m) => m.id === currentMatchId)
  // window: one match before the current, the current, and the next three —
  // clamped so it always shows up to five even near the ends of the schedule
  let start = currentIndex >= 0 ? currentIndex - 1 : 0
  start = Math.max(0, Math.min(start, Math.max(0, queue.length - 5)))
  const window = queue.slice(start, start + 5)

  const nextMatchId =
    (currentIndex >= 0 ? queue.slice(currentIndex + 1) : queue).find(
      (m) => m.status === "scheduled"
    )?.id ?? null

  if (window.length === 0) {
    return (
      <p className={cn("text-center text-2xl", dark ? "text-white/60" : "")}>
        No matches scheduled.
      </p>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <AnimatePresence initial={false} mode="popLayout">
        {window.map((match, i) => {
          const highlight =
            match.id === currentMatchId
              ? "current"
              : match.id === nextMatchId
                ? "next"
                : null
          return (
            <motion.div
              key={match.id}
              layout
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -28 }}
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 30,
                delay: i * 0.06,
              }}
            >
              <ScheduleRow
                match={match}
                numbers={numbers}
                order={order}
                highlight={highlight}
                dark={dark}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

function ScheduleRow({
  match,
  numbers,
  order,
  highlight,
  dark,
}: {
  match: ScheduleMatch
  numbers: Map<string, number>
  order: readonly [Alliance, Alliance]
  highlight: "current" | "next" | null
  dark: boolean
}) {
  const posted = match.status === "posted"
  return (
    <div
      className={cn(
        "relative flex items-center gap-4 border px-5 py-4",
        dark ? "border-white/15 bg-white/5" : "bg-card",
        // mirror the bracket: current pulses green, next is steady yellow
        highlight === "current" && "animate-bracket-pulse",
        highlight === "next" && "ring-2 ring-yellow-500 ring-inset",
        // a played reference match recedes slightly
        !highlight && posted && "opacity-55",
        // reserve room above for the notch so it never overlaps the row above
        highlight && "mt-5"
      )}
    >
      {highlight && (
        <span
          className={cn(
            "absolute bottom-full left-1/2 z-10 -translate-x-1/2 px-2 py-0.5 text-xs font-bold tracking-wide uppercase",
            highlight === "current"
              ? "bg-green-500 text-white"
              : "bg-yellow-500 text-black"
          )}
        >
          {highlight === "current" ? "On Field" : "On Deck"}
        </span>
      )}

      <div className="w-28 shrink-0 text-xl font-bold tabular-nums">
        {matchLongLabel(match)}
      </div>

      <div className="flex flex-1 items-center justify-center gap-4">
        {order.map((side, idx) => (
          <div key={side} className="flex items-center gap-3">
            {idx > 0 && (
              <span
                className={cn(
                  "text-sm font-medium",
                  dark ? "text-white/40" : "text-muted-foreground"
                )}
              >
                vs
              </span>
            )}
            <AllianceTeams match={match} side={side} numbers={numbers} />
          </div>
        ))}
      </div>

      <div className="w-24 shrink-0 text-right font-mono text-xl font-bold tabular-nums">
        {posted ? (
          <span>
            {order
              .map(
                (s) => (s === "red" ? match.redPoints : match.bluePoints) ?? 0
              )
              .join("–")}
          </span>
        ) : match.status === "running" ? (
          <span className="text-green-500">LIVE</span>
        ) : (
          <span className={dark ? "text-white/30" : "text-muted-foreground"}>
            —
          </span>
        )}
      </div>
    </div>
  )
}

function AllianceTeams({
  match,
  side,
  numbers,
}: {
  match: ScheduleMatch
  side: Alliance
  numbers: Map<string, number>
}) {
  const ids =
    side === "red"
      ? [match.red1, match.red2, match.red3]
      : [match.blue1, match.blue2, match.blue3]
  const backup = side === "red" ? match.red4 : match.blue4
  const color = `var(--alliance-${side})`

  return (
    <div className="flex items-center gap-1.5">
      {ids.map((id, i) => (
        <span
          key={i}
          className="min-w-9 px-1.5 py-0.5 text-center text-lg font-bold text-white tabular-nums"
          style={{ backgroundColor: color }}
        >
          {id ? (numbers.get(id) ?? "?") : "—"}
        </span>
      ))}
      {backup && (
        <span
          className="min-w-9 px-1.5 py-0.5 text-center text-lg font-bold tabular-nums"
          style={{ color, border: `1px solid ${color}` }}
          title="Backup robot"
        >
          {numbers.get(backup) ?? "?"}
        </span>
      )}
    </div>
  )
}
