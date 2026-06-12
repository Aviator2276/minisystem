import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { AnimatedNumber } from "@/components/animated-number"
import { TeamCards } from "@/components/team-cards"
import { cn } from "@/lib/utils"
import { TOWER_STRENGTH, opponentTowerStrength } from "@/games/stronghold"
import type { StrongholdScore } from "@/games/stronghold"
import { useServerClock } from "@/hooks/use-server-clock"
import type { Alliance } from "@/shared/alliance"
import { EMPTY_CARD_STATE } from "@/shared/cards"
import type { TeamCardState } from "@/shared/cards"
import type { TimelineSegment } from "@/games/types"
import type { ServerMessage } from "@/shared/realtime-messages"

interface TeamSlot {
  label: number | string
  cards: TeamCardState
  /** playoff backup robot — rendered with a BACKUP tag */
  backup?: boolean
}

const EMPTY_SLOT: TeamSlot = { label: "—", cards: EMPTY_CARD_STATE }

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

const PHASE_LABELS: Record<string, string> = {
  no_entry: "Stand by",
  safe_to_enter: "Get ready",
  auto: "Autonomous",
  pause: "Pause",
  teleop: "Teleop",
  endgame: "Endgame",
  post_match: "Final",
  fault: "Field fault",
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
  order,
}: {
  label: string
  teams: { teamId: string; number: number; cards?: TeamCardState }[]
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
  live: { red: AllianceLive; blue: AllianceLive }
  field: { phase: string; phaseEndsAt: number | null }
  timeline: TimelineSegment[]
  order: readonly [Alliance, Alliance]
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

  const byId = new Map(teams.map((t) => [t.teamId, t]))
  const slotFor = (id: string | null, backup = false): TeamSlot => {
    const team = id ? byId.get(id) : undefined
    return {
      label: team?.number ?? (id ? "?" : "—"),
      cards: team?.cards ?? EMPTY_CARD_STATE,
      backup,
    }
  }
  const teamsOf = (side: "red" | "blue"): TeamSlot[] => {
    if (!current) return [EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT]
    const [t1, t2, t3, t4] =
      side === "red"
        ? [current.red1, current.red2, current.red3, current.red4]
        : [current.blue1, current.blue2, current.blue3, current.blue4]
    const slots = [slotFor(t1), slotFor(t2), slotFor(t3)]
    // only show the 4th row when a backup robot is actually assigned
    if (t4) slots.push(slotFor(t4, true))
    return slots
  }

  const phaseColor = PHASE_COLORS[field.phase] ?? "bg-muted"
  const phaseLabel = PHASE_LABELS[field.phase] ?? field.phase
  const [leftSide, rightSide] = order

  return (
    <div className="flex items-stretch overflow-hidden border border-border bg-card shadow-2xl">
      <AlliancePanel
        side={leftSide}
        teams={teamsOf(leftSide)}
        mine={live[leftSide]}
        opponent={live[rightSide]}
        mirrored={false}
      />

      <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 border-x border-border px-8 py-2">
        <div className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
          {label}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 leading-none">
          <AnimatedNumber
            value={live[leftSide].totals?.total ?? 0}
            className="min-w-[1.6em] justify-self-end text-right text-8xl font-medium tabular-nums"
            style={{ color: `var(--alliance-${leftSide})` }}
          />
          <span className="pb-2 text-4xl font-light text-muted-foreground">
            –
          </span>
          <AnimatedNumber
            value={live[rightSide].totals?.total ?? 0}
            className="min-w-[1.6em] justify-self-start text-left text-8xl font-medium tabular-nums"
            style={{ color: `var(--alliance-${rightSide})` }}
          />
        </div>
        {remainingMs !== null ? (
          <div className="text-3xl font-bold text-card-foreground tabular-nums">
            {formatTime(remainingMs)}
          </div>
        ) : (
          <div className="text-base font-semibold text-muted-foreground">
            {phaseLabel}
          </div>
        )}
        <div className="relative h-1.5 w-full overflow-hidden bg-muted">
          {progressPct !== null && (
            <div
              className={`absolute inset-y-0 left-0 transition-[width] duration-100 ease-linear ${phaseColor}`}
              style={{ width: `${progressPct}%` }}
            />
          )}
        </div>
      </div>

      <AlliancePanel
        side={rightSide}
        teams={teamsOf(rightSide)}
        mine={live[rightSide]}
        opponent={live[leftSide]}
        mirrored={true}
      />
    </div>
  )
}

function AlliancePanel({
  side,
  teams,
  mine,
  opponent,
  mirrored,
}: {
  side: "red" | "blue"
  teams: TeamSlot[]
  mine: AllianceLive
  opponent: AllianceLive
  /** mirror the inner layout (the panel sitting on the right edge) */
  mirrored: boolean
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
      className={cn(
        "flex flex-1 items-center gap-5 overflow-hidden px-6 py-3",
        mirrored ? "flex-row-reverse text-right" : "text-left"
      )}
      style={{
        borderTop: `6px solid ${color}`,
        background: `color-mix(in oklch, ${color} 10%, var(--card))`,
      }}
    >
      <div className="flex flex-col gap-0.5">
        {teams.map((slot, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-1.5",
              mirrored && "flex-row-reverse"
            )}
          >
            <div
              className={cn(
                "w-16 px-2 py-0.5 text-center text-xl font-black text-white tabular-nums",
                slot.cards.disqualified && "line-through opacity-50",
                slot.backup && "text-base"
              )}
              style={{ backgroundColor: color }}
            >
              {slot.label}
            </div>
            {slot.backup && (
              <span
                className="px-1 py-0.5 text-[0.6rem] font-bold tracking-wide uppercase"
                style={{
                  color,
                  border: `1px solid color-mix(in oklch, ${color} 50%, transparent)`,
                }}
              >
                Backup
              </span>
            )}
            <TeamCards cards={slot.cards} size="md" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div>
          <div className="mb-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Tower
          </div>
          <div className="flex gap-1">
            {Array.from({ length: TOWER_STRENGTH }).map((_, i) => (
              <div
                key={i}
                className="h-5 w-5 transition-colors duration-300"
                style={{
                  backgroundColor: i < tower ? color : "var(--muted)",
                  opacity: i < tower ? 1 : 0.5,
                }}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Defenses
          </div>
          <div className="flex gap-1">
            {defenses.map((strength, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                {[1, 2].map((level) => (
                  <div
                    key={level}
                    className="h-2 w-5 transition-colors duration-300"
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
      </div>

      <div className="flex w-24 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">
            High
          </span>
          <span className="text-xl font-bold tabular-nums">
            {(boulders?.autoHigh ?? 0) + (boulders?.teleHigh ?? 0)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">
            Low
          </span>
          <span className="text-xl font-bold tabular-nums">
            {(boulders?.autoLow ?? 0) + (boulders?.teleLow ?? 0)}
          </span>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-col gap-1.5",
          side === "red" ? "ml-auto" : "mr-auto"
        )}
      >
        <ObjectiveBadge
          label="Breach"
          achieved={mine.totals?.breach ?? false}
          color={color}
        />
        <ObjectiveBadge
          label="Capture"
          achieved={mine.totals?.capture ?? false}
          color={color}
        />
      </div>
    </div>
  )
}

/**
 * Bonus-objective indicator. Always visible so the audience can track progress;
 * fills with the alliance color and pulses once when the objective is earned.
 * Breach = ≥4 defenses damaged; Capture = tower weakened + all 3 bots scaled/
 * challenged. Each is worth a ranking point in quals (20/25 pts in playoffs).
 */
function ObjectiveBadge({
  label,
  achieved,
  color,
}: {
  label: string
  achieved: boolean
  color: string
}) {
  return (
    <motion.div
      animate={achieved ? { scale: [1, 1.12, 1] } : { scale: 1 }}
      transition={{ type: "spring", stiffness: 360, damping: 16 }}
      className={cn(
        "w-28 border px-2.5 py-1 text-sm font-bold tracking-wide uppercase transition-colors duration-300",
        achieved
          ? "text-white shadow-lg"
          : "border-border text-muted-foreground/40"
      )}
      style={
        achieved
          ? {
              backgroundColor: color,
              borderColor: color,
              boxShadow: `0 0 16px color-mix(in oklch, ${color} 70%, transparent)`,
            }
          : undefined
      }
    >
      {label}
    </motion.div>
  )
}
