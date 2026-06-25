import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useRealtime } from "@/hooks/use-realtime"
import { cn } from "@/lib/utils"
import {
  adjustTeamRankingPoints,
  getRankings,
} from "@/server/functions/rankings"
import { topicFor } from "@/shared/realtime-messages"

export const Route = createFileRoute("/admin/events/$eventSlug/rankings")({
  loader: ({ context }) => getRankings({ data: { eventId: context.event.id } }),
  component: TeamsPage,
})

type Row = Awaited<ReturnType<typeof getRankings>>[number]

type SortKey =
  | "rankingPoints"
  | "avgRp"
  | "wins"
  | "auto"
  | "endgame"
  | "boulders"
  | "played"
  | "number"

const avg = (value: number, played: number) =>
  played === 0 ? 0 : value / played

// numeric value each sort key reads off a row
const VALUE: Record<SortKey, (r: Row) => number> = {
  rankingPoints: (r) => r.rankingPoints,
  avgRp: (r) => avg(r.rp, r.matchesPlayed),
  wins: (r) => r.wins,
  auto: (r) => r.autoPoints,
  endgame: (r) => r.endgamePoints,
  boulders: (r) => r.boulders,
  played: (r) => r.matchesPlayed,
  number: (r) => r.number,
}

// "ranking systems" are presets that pick the primary sort key + direction
const RANKING_SYSTEMS: { id: SortKey; label: string }[] = [
  { id: "rankingPoints", label: "Ranking points" },
  { id: "avgRp", label: "Average RP" },
  { id: "wins", label: "Wins" },
  { id: "auto", label: "Auto points" },
  { id: "endgame", label: "Endgame points" },
]

type Sort = { key: SortKey; dir: "asc" | "desc" }

function sortRows(rows: Row[], sort: Sort): Row[] {
  const read = VALUE[sort.key]
  const dir = sort.dir === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const primary = (read(a) - read(b)) * dir
    if (primary !== 0) return primary
    // stable tiebreak: average RP, then team number ascending
    return (
      avg(b.rp, b.matchesPlayed) - avg(a.rp, a.matchesPlayed) ||
      a.number - b.number
    )
  })
}

function TeamsPage() {
  const { event } = Route.useRouteContext()
  const eventId = event.id
  const loaded = Route.useLoaderData()

  const [rows, setRows] = useState<Row[]>(loaded)
  const [system, setSystem] = useState<SortKey>("rankingPoints")
  const [sort, setSort] = useState<Sort>({ key: "rankingPoints", dir: "desc" })

  useEffect(() => setRows(loaded), [loaded])

  const getRankingsFn = useServerFn(getRankings)
  const adjustFn = useServerFn(adjustTeamRankingPoints)

  // keep the table live when another admin (or the same one elsewhere) edits
  useRealtime([topicFor(eventId, "control")], (message) => {
    if (message.type === "rankings_update") {
      void getRankingsFn({ data: { eventId } }).then(setRows)
    }
  })

  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort])

  function pickSystem(next: SortKey) {
    setSystem(next)
    setSort({ key: next, dir: "desc" })
  }

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "number" ? "asc" : "desc" }
    )
  }

  async function adjust(teamId: string, delta: number) {
    // optimistic; the server returns the authoritative recomputed rankings.
    // rankingPoints is the total (earned + manual), and the manual delta moves
    // it directly, so we just add delta here
    setRows((prev) =>
      prev.map((r) =>
        r.teamId === teamId
          ? { ...r, rankingPoints: r.rankingPoints + delta }
          : r
      )
    )
    try {
      setRows(await adjustFn({ data: { eventId, teamId, delta } }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setRows(await getRankingsFn({ data: { eventId } }))
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          Ranking system
        </span>
        <Select value={system} onValueChange={(v) => pickSystem(v as SortKey)}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANKING_SYSTEMS.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Rank</TableHead>
            <SortHead sort={sort} sortKey="number" onSort={toggleSort}>
              Team
            </SortHead>
            <SortHead
              sort={sort}
              sortKey="rankingPoints"
              onSort={toggleSort}
              align="right"
            >
              Ranking pts
            </SortHead>
            <SortHead
              sort={sort}
              sortKey="avgRp"
              onSort={toggleSort}
              align="right"
            >
              Avg RP
            </SortHead>
            <SortHead
              sort={sort}
              sortKey="wins"
              onSort={toggleSort}
              align="right"
            >
              W-L-T
            </SortHead>
            <SortHead
              sort={sort}
              sortKey="auto"
              onSort={toggleSort}
              align="right"
            >
              Auto
            </SortHead>
            <SortHead
              sort={sort}
              sortKey="endgame"
              onSort={toggleSort}
              align="right"
            >
              Endgame
            </SortHead>
            <SortHead
              sort={sort}
              sortKey="boulders"
              onSort={toggleSort}
              align="right"
            >
              Boulders
            </SortHead>
            <SortHead
              sort={sort}
              sortKey="played"
              onSort={toggleSort}
              align="right"
            >
              Played
            </SortHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row, i) => (
            <TableRow key={row.teamId}>
              <TableCell className="font-bold tabular-nums">{i + 1}</TableCell>
              <TableCell>
                <span className="font-mono font-bold">{row.number}</span>{" "}
                {row.name}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-6"
                    aria-label={`Subtract a ranking point from ${row.number}`}
                    onClick={() => void adjust(row.teamId, -1)}
                  >
                    <MinusIcon className="size-3.5" />
                  </Button>
                  <span className="w-6 text-center font-mono font-bold tabular-nums">
                    {row.rankingPoints}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-6"
                    aria-label={`Add a ranking point to ${row.number}`}
                    onClick={() => void adjust(row.teamId, 1)}
                  >
                    <PlusIcon className="size-3.5" />
                  </Button>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.matchesPlayed > 0
                  ? (row.rp / row.matchesPlayed).toFixed(2)
                  : "0.00"}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.wins}-{row.losses}-{row.ties}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.autoPoints}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.endgamePoints}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.boulders}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.matchesPlayed}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function SortHead({
  sort,
  sortKey,
  onSort,
  align,
  children,
}: {
  sort: Sort
  sortKey: SortKey
  onSort: (key: SortKey) => void
  align?: "right"
  children: React.ReactNode
}) {
  const active = sort.key === sortKey
  const Icon = !active
    ? ChevronsUpDownIcon
    : sort.dir === "desc"
      ? ArrowDownIcon
      : ArrowUpIcon
  return (
    <TableHead className={cn(align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {children}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  )
}
