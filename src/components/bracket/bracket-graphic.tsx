import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { BracketView } from "@/server/playoffs/advance"
import { TrophyIcon } from "lucide-react"

type BracketMatch = BracketView["matches"][number]

/**
 * Round-by-round double-elimination bracket. Upper bracket on top, lower
 * bracket beneath, grand final at the right. Pure CSS grid so it renders the
 * same in the admin panel, on the display screen, and on public pages.
 */
export function BracketGraphic({
  bracket,
  dark = false,
}: {
  bracket: BracketView
  dark?: boolean
}) {
  if (bracket.matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No bracket generated yet.</p>
    )
  }

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
            <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
              {rounds.map((round) => {
                const cell = laneMatches.filter((m) => m.round === round)
                if (cell.length === 0) return null
                return (
                  <div
                    key={round}
                    className="flex min-w-36 flex-col justify-around gap-2"
                  >
                    {cell.map((match) => (
                      <MatchCard key={match.id} match={match} dark={dark} />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MatchCard({ match, dark }: { match: BracketMatch; dark: boolean }) {
  return (
    <div
      className={cn(
        "border text-sm",
        dark ? "border-white/20 bg-white/5" : "bg-card",
        match.bracket === "final" && "ring-2 ring-yellow-500"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between border-b px-2 py-0.5 text-[0.65rem]",
          dark ? "border-white/20 text-white/50" : "text-muted-foreground"
        )}
      >
        <span>{match.bracketSlot === "F" ? "FINAL" : match.bracketSlot}</span>
        {match.status === "posted" && <Badge variant="secondary">done</Badge>}
      </div>
      <SideRow
        side="red"
        number={match.redAllianceNumber}
        points={match.redPoints}
        won={match.winner === "red"}
        source={match.redSource}
        dark={dark}
      />
      <SideRow
        side="blue"
        number={match.blueAllianceNumber}
        points={match.bluePoints}
        won={match.winner === "blue"}
        source={match.blueSource}
        dark={dark}
      />
    </div>
  )
}

function SideRow({
  side,
  number,
  points,
  won,
  source,
  dark,
}: {
  side: "red" | "blue"
  number: number | null
  points: number | null
  won: boolean
  source: string | null
  dark: boolean
}) {
  const color = side === "red" ? "var(--alliance-red)" : "var(--alliance-blue)"
  return (
    <div
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
