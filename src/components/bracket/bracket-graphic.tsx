import { useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { BracketView } from "@/server/playoffs/advance"
import { TrophyIcon } from "lucide-react"

type BracketMatch = BracketView["matches"][number]
type ElMap = React.RefObject<Map<string, HTMLElement>>

interface Connector {
  /** bracketSlot of the source match the winner flows out of */
  from: string
  /** `${destSlot}:${side}` row the winner flows into */
  to: string
}

interface Line {
  x1: number
  y1: number
  x2: number
  y2: number
  /** x of the vertical segment — its own channel so lines don't overlap */
  vx: number
}

// emerald reads clearly on both the light admin panel and dark arena/TV screens
const WINNER_STROKE = "#10b981"

/**
 * Layout-space offset of `el` relative to `container`, walking the offsetParent
 * chain. Unlike getBoundingClientRect this ignores CSS transforms, so the lines
 * stay aligned inside ScaleToFit (display/TV) where the bracket is scaled.
 */
function offsetWithin(
  el: HTMLElement,
  container: HTMLElement
): { x: number; y: number } {
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== container) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return { x, y }
}

/**
 * Round-by-round double-elimination bracket. Upper bracket on top, lower
 * bracket beneath, grand final at the right. An SVG overlay draws one line from
 * each match to the slot its winner advances to, so the flow is readable.
 */
export function BracketGraphic({
  bracket,
  dark = false,
  currentMatchId = null,
}: {
  bracket: BracketView
  dark?: boolean
  /** the match loaded on the field — highlighted green; the next scheduled
   * match after it is highlighted yellow */
  currentMatchId?: string | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardEls = useRef<Map<string, HTMLElement>>(new Map())
  const rowEls = useRef<Map<string, HTMLElement>>(new Map())
  const [lines, setLines] = useState<Line[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  // one line per match: where its winner advances. Derived from each row whose
  // source is `winner:SLOT` (loser drops are intentionally not drawn).
  const connectors = useMemo<Connector[]>(() => {
    const out: Connector[] = []
    for (const m of bracket.matches) {
      for (const side of ["red", "blue"] as const) {
        const src = side === "red" ? m.redSource : m.blueSource
        if (!src) continue
        const [kind, key] = src.split(":")
        if (kind === "winner" && key) {
          out.push({ from: key, to: `${m.bracketSlot}:${side}` })
        }
      }
    }
    return out
  }, [bracket.matches])

  // measure after layout; the lines live in the container's pixel space so they
  // scroll with the content
  useEffect(() => {
    function measure() {
      const container = containerRef.current
      if (!container) return
      const next: Line[] = []
      for (const c of connectors) {
        const fromEl = cardEls.current.get(c.from)
        const toEl = rowEls.current.get(c.to)
        if (!fromEl || !toEl) continue
        const f = offsetWithin(fromEl, container)
        const t = offsetWithin(toEl, container)
        next.push({
          // the line always exits the source card's right edge and enters the
          // left edge of the destination row
          x1: f.x + fromEl.offsetWidth,
          y1: f.y + fromEl.offsetHeight / 2,
          x2: t.x,
          y2: t.y + toEl.offsetHeight / 2,
          vx: 0, // assigned below
        })
      }

      // Give every line feeding the same destination column its own vertical
      // channel in the gutter just left of that column, so their vertical
      // segments sit side by side instead of overlapping. Clamp the channel to
      // the right of the source so a line never routes back out the left edge.
      const byColumn = new Map<number, Line[]>()
      for (const l of next) {
        const key = Math.round(l.x2)
        const group = byColumn.get(key)
        if (group) group.push(l)
        else byColumn.set(key, [l])
      }
      for (const group of byColumn.values()) {
        group.sort((a, b) => a.y1 - b.y1)
        const spacing = Math.min(8, 24 / (group.length + 1))
        group.forEach((l, i) => {
          l.vx = Math.max(l.x1 + 6, l.x2 - (i + 1) * spacing)
        })
      }

      setLines(next)
      setSize({ w: container.scrollWidth, h: container.scrollHeight })
    }

    measure()
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    window.addEventListener("resize", measure)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [connectors, currentMatchId, dark])

  if (bracket.matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No bracket generated yet.</p>
    )
  }

  // bracket.matches is in scheduledOrder; "next" is the next still-scheduled
  // match after the current one (or the first scheduled if none is current)
  const currentIndex = bracket.matches.findIndex((m) => m.id === currentMatchId)
  const nextMatchId =
    (currentIndex >= 0
      ? bracket.matches.slice(currentIndex + 1)
      : bracket.matches
    ).find((m) => m.status === "scheduled")?.id ?? null

  const rounds = [...new Set(bracket.matches.map((m) => m.round))].sort(
    (a, b) => a - b
  )
  const lanes: Array<{ label: string; filter: (m: BracketMatch) => boolean }> =
    [
      {
        label: "Upper bracket",
        filter: (m) => m.bracket === "upper" || m.bracket === "final",
      },
      { label: "Lower bracket", filter: (m) => m.bracket === "lower" },
    ]

  return (
    <div className="flex flex-col gap-4">
      {bracket.champion && (
        <div
          className={cn(
            "flex items-center gap-2 text-lg font-bold",
            dark ? "text-yellow-300" : "text-yellow-600"
          )}
        >
          <TrophyIcon className="size-5" />
          Alliance {bracket.champion.number} wins the event
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <div ref={containerRef} className="relative w-max">
          <svg
            className="pointer-events-none absolute inset-0 z-0"
            width={size.w}
            height={size.h}
            shapeRendering="crispEdges"
            aria-hidden
          >
            {lines.map((l, i) => (
              // square elbow: out the right edge, across to this line's channel,
              // straight down, then into the destination
              <path
                key={i}
                d={`M ${l.x1} ${l.y1} H ${l.vx} V ${l.y2} H ${l.x2}`}
                fill="none"
                stroke={WINNER_STROKE}
                strokeWidth={2}
              />
            ))}
          </svg>

          <div className="relative z-10 flex flex-col gap-4">
            {lanes.map((lane) => {
              const laneMatches = bracket.matches.filter(lane.filter)
              if (laneMatches.length === 0) return null
              return (
                <div key={lane.label} className="flex flex-col gap-1.5">
                  <div
                    className={cn(
                      "text-xs font-medium tracking-widest uppercase",
                      dark ? "text-white/50" : "text-muted-foreground"
                    )}
                  >
                    {lane.label}
                  </div>
                  <div className="flex items-stretch gap-8">
                    {rounds.map((round) => {
                      const cell = laneMatches.filter((m) => m.round === round)
                      if (cell.length === 0) return null
                      return (
                        <div
                          key={round}
                          className="flex min-w-36 flex-col justify-around gap-2"
                        >
                          {cell.map((match) => (
                            <MatchCard
                              key={match.id}
                              match={match}
                              dark={dark}
                              cardEls={cardEls}
                              rowEls={rowEls}
                              highlight={
                                match.id === currentMatchId
                                  ? "current"
                                  : match.id === nextMatchId
                                    ? "next"
                                    : null
                              }
                            />
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "flex items-center gap-1.5 text-[0.65rem]",
          dark ? "text-white/50" : "text-muted-foreground"
        )}
      >
        <svg width={20} height={6} aria-hidden>
          <line
            x1={0}
            y1={3}
            x2={20}
            y2={3}
            stroke={WINNER_STROKE}
            strokeWidth={2}
          />
        </svg>
        Winner advances
      </div>
    </div>
  )
}

function MatchCard({
  match,
  dark,
  highlight,
  cardEls,
  rowEls,
}: {
  match: BracketMatch
  dark: boolean
  highlight: "current" | "next" | null
  cardEls: ElMap
  rowEls: ElMap
}) {
  const slot = match.bracketSlot ?? ""
  return (
    <div
      ref={(el) => {
        if (!slot) return
        const map = cardEls.current
        if (el) map.set(slot, el)
        else map.delete(slot)
      }}
      className={cn(
        "relative border text-sm",
        // opaque on both themes so the connector lines (drawn behind) never
        // show through the card; dark mode uses an opaque equivalent of the
        // old translucent white/5 tint over the screen background
        dark ? "border-white/20" : "bg-card",
        // current match → pulsing green, next scheduled → steady yellow; these
        // take priority over the final's subtler decorative ring. ring-inset /
        // inset box-shadow so the highlight isn't clipped by the lane's
        // overflow-x-auto scroll container
        highlight === "current" && "animate-bracket-pulse",
        highlight === "next" && "ring-2 ring-inset ring-yellow-500",
        !highlight &&
          match.bracket === "final" &&
          "ring-1 ring-inset ring-yellow-500/40",
        // reserve room below for the notch so it never overlaps the next match
        highlight && "mb-5"
      )}
      style={
        dark
          ? { background: "color-mix(in oklch, white 5%, var(--background))" }
          : undefined
      }
    >
      {highlight && (
        <span
          className={cn(
            "absolute top-full left-1/2 z-10 -translate-x-1/2 px-1.5 py-0.5 text-[0.55rem] font-bold tracking-wide uppercase",
            highlight === "current"
              ? "bg-green-500 text-white"
              : "bg-yellow-500 text-black"
          )}
        >
          {highlight === "current" ? "Current" : "Upcoming"}
        </span>
      )}
      <div
        className={cn(
          "flex items-center justify-between border-b px-2 py-0.5 text-[0.65rem]",
          dark ? "border-white/20 text-white/50" : "text-muted-foreground"
        )}
      >
        <span>{slot === "F" ? "FINAL" : slot}</span>
        {match.status === "posted" && <Badge variant="secondary">done</Badge>}
      </div>
      <SideRow
        side="red"
        slot={slot}
        number={match.redAllianceNumber}
        points={match.redPoints}
        won={match.winner === "red"}
        source={match.redSource}
        dark={dark}
        rowEls={rowEls}
      />
      <SideRow
        side="blue"
        slot={slot}
        number={match.blueAllianceNumber}
        points={match.bluePoints}
        won={match.winner === "blue"}
        source={match.blueSource}
        dark={dark}
        rowEls={rowEls}
      />
    </div>
  )
}

function SideRow({
  side,
  slot,
  number,
  points,
  won,
  source,
  dark,
  rowEls,
}: {
  side: "red" | "blue"
  slot: string
  number: number | null
  points: number | null
  won: boolean
  source: string | null
  dark: boolean
  rowEls: ElMap
}) {
  const color = side === "red" ? "var(--alliance-red)" : "var(--alliance-blue)"
  return (
    <div
      ref={(el) => {
        const map = rowEls.current
        const key = `${slot}:${side}`
        if (el) map.set(key, el)
        else map.delete(key)
      }}
      className={cn("flex items-center gap-2 px-2 py-1", won && "font-bold")}
      style={{ opacity: number === null ? 0.55 : 1 }}
    >
      <span
        className="w-7 px-1 text-center text-xs font-bold text-white tabular-nums"
        style={{ backgroundColor: color }}
      >
        {number ?? "?"}
      </span>
      <span
        className={cn("flex-1 truncate text-xs", dark ? "text-white/70" : "")}
      >
        {number !== null ? `Alliance ${number}` : sourceLabel(source)}
      </span>
      <span className="font-mono text-xs tabular-nums">{points ?? ""}</span>
      {won && <span className="text-[0.6rem]">◀</span>}
    </div>
  )
}

function sourceLabel(source: string | null): string {
  if (!source) return "TBD"
  const [kind, key] = source.split(":")
  if (kind === "seed") return `Seed ${key}`
  return `${kind === "winner" ? "W" : "L"} of ${key}`
}
