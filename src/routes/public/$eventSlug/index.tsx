import { useMemo, useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { TvIcon } from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import { BracketGraphic } from "@/components/bracket/bracket-graphic"
import { SelectionBoard } from "@/components/selection-board"
import { TeamCards } from "@/components/team-cards"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRealtime } from "@/hooks/use-realtime"
import { cn } from "@/lib/utils"
import {
  getDisplayBootstrap,
  listPublicEvents,
} from "@/server/functions/display"
import { allianceOrder } from "@/shared/alliance"
import type { Alliance } from "@/shared/alliance"
import { matchShortLabel } from "@/shared/match-format"
import { topicFor } from "@/shared/realtime-messages"
import type { ScoreTotals } from "@/shared/score-types"

export const Route = createFileRoute("/public/$eventSlug/")({
  loader: async ({ params }) => {
    const [boot, events] = await Promise.all([
      getDisplayBootstrap({ data: { slug: params.eventSlug } }),
      listPublicEvents(),
    ])
    return { boot, events }
  },
  component: PublicEventPage,
})

type Boot = Awaited<ReturnType<typeof getDisplayBootstrap>>
type PublicMatch = Boot["matches"][number]
type PublicTeam = Boot["teams"][number]
type Ranking = Boot["rankings"][number]

const matchLabel = matchShortLabel
const totalsOf = (score: PublicMatch["redScore"]) =>
  (score as { totals?: ScoreTotals } | null)?.totals ?? null

function PublicEventPage() {
  const { boot, events } = Route.useLoaderData()
  const router = useRouter()
  const { eventSlug } = Route.useParams()

  // anything that changes standings, alliances, or the field refreshes the data
  useRealtime([topicFor(boot.event.id, "public")], (message) => {
    if (
      message.type === "score_update" ||
      message.type === "selection_update" ||
      message.type === "bracket_update" ||
      message.type === "match_state" ||
      message.type === "settings_update" ||
      message.type === "cards_update" ||
      message.type === "rankings_update"
    ) {
      void router.invalidate()
    }
  })

  const teamById = useMemo(
    () => new Map(boot.teams.map((t) => [t.teamId, t])),
    [boot.teams]
  )
  const order = allianceOrder(boot.event.flipAllianceSides)

  const selectionStarted =
    boot.selection.complete ||
    boot.selection.alliances.some((a) => a.captain !== null)

  // selected team drives the "Team" overview tab; default to rank #1
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [tab, setTab] = useState("overview")

  const selectTeam = (teamId: string) => {
    setSelectedTeamId(teamId)
    setTab("team")
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-7xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <Select
          value={boot.event.id}
          onValueChange={(id) => {
            const next = events.find((e) => e.id === id)
            if (next)
              void router.navigate({
                to: "/public/$eventSlug",
                params: { eventSlug: next.slug },
              })
          }}
        >
          <SelectTrigger className="w-auto min-w-44 font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary">{boot.event.status.replace("_", " ")}</Badge>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="outline" size="sm">
            <Link to="/public/$eventSlug/tv" params={{ eventSlug }}>
              <TvIcon />
              TV mode
            </Link>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* main: statistics + match views */}
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="alliances">Alliances</TabsTrigger>
            <TabsTrigger value="bracket">Bracket</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex flex-col gap-4 pt-2">
            <OverviewTab matches={boot.matches} rankings={boot.rankings} />
          </TabsContent>

          <TabsContent value="team" className="pt-2">
            <TeamTab
              matches={boot.matches}
              rankings={boot.rankings}
              teamById={teamById}
              selectedTeamId={selectedTeamId}
              onSelectTeam={setSelectedTeamId}
            />
          </TabsContent>

          <TabsContent value="schedule" className="flex flex-col gap-2 pt-2">
            {boot.matches.length === 0 ? (
              <Empty>No matches scheduled yet.</Empty>
            ) : (
              boot.matches.map((match) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  isCurrent={match.id === boot.field.matchId}
                  running={boot.field.running}
                  teamById={teamById}
                  order={order}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="alliances" className="@container/board pt-2">
            {selectionStarted ? (
              <SelectionBoard state={boot.selection} />
            ) : (
              <Empty>Alliance selection hasn&apos;t started yet.</Empty>
            )}
          </TabsContent>

          <TabsContent value="bracket" className="pt-2">
            {boot.bracket.matches.length === 0 ? (
              <Empty>The playoff bracket hasn&apos;t been generated yet.</Empty>
            ) : (
              <BracketGraphic
                bracket={boot.bracket}
                currentMatchId={boot.field.matchId}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* right sidebar: rankings + roster */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Sidebar
            rankings={boot.rankings}
            teams={boot.teams}
            teamById={teamById}
            onSelectTeam={selectTeam}
          />
        </aside>
      </div>
    </main>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>
}

// ── right sidebar ────────────────────────────────────────────────────────────

function Sidebar({
  rankings,
  teams,
  teamById,
  onSelectTeam,
}: {
  rankings: Ranking[]
  teams: PublicTeam[]
  teamById: Map<string, PublicTeam>
  onSelectTeam: (teamId: string) => void
}) {
  return (
    <Tabs defaultValue="rankings">
      <TabsList className="w-full">
        <TabsTrigger value="rankings" className="flex-1">
          Rankings
        </TabsTrigger>
        <TabsTrigger value="teams" className="flex-1">
          Teams
        </TabsTrigger>
      </TabsList>

      <TabsContent value="rankings" className="pt-2">
        {rankings.length === 0 ? (
          <Empty>No rankings yet.</Empty>
        ) : (
          <div className="flex flex-col">
            {rankings.map((row) => {
              const cards = teamById.get(row.teamId)?.cards
              return (
                <button
                  key={row.teamId}
                  type="button"
                  onClick={() => onSelectTeam(row.teamId)}
                  className={cn(
                    "flex items-center gap-2 border-b px-2 py-1.5 text-left text-sm hover:bg-accent",
                    cards?.disqualified && "opacity-50"
                  )}
                >
                  <span className="w-5 text-right font-bold text-muted-foreground tabular-nums">
                    {row.rank}
                  </span>
                  <span className="font-mono font-bold tabular-nums">
                    {row.number}
                  </span>
                  <span className="flex-1 truncate text-muted-foreground">
                    {row.name}
                  </span>
                  {cards && <TeamCards cards={cards} size="sm" />}
                  <span className="font-mono font-bold tabular-nums">
                    {row.rankingPoints}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </TabsContent>

      <TabsContent value="teams" className="pt-2">
        <div className="flex flex-col">
          {teams.map((team) => (
            <button
              key={team.teamId}
              type="button"
              onClick={() => onSelectTeam(team.teamId)}
              className={cn(
                "flex items-center gap-2 border-b px-2 py-1.5 text-left text-sm hover:bg-accent",
                team.cards.disqualified && "opacity-50"
              )}
            >
              <span className="w-8 font-mono font-bold tabular-nums">
                {team.number}
              </span>
              <span className="flex-1 truncate">{team.name}</span>
              <TeamCards cards={team.cards} size="sm" />
            </button>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  )
}

// ── overview tab: event aggregates + trend charts ────────────────────────────

const scoringConfig = {
  red: { label: "Red", color: "var(--alliance-red)" },
  blue: { label: "Blue", color: "var(--alliance-blue)" },
} satisfies ChartConfig

const TREND_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

function OverviewTab({
  matches,
  rankings,
}: {
  matches: PublicMatch[]
  rankings: Ranking[]
}) {
  const posted = useMemo(
    () => matches.filter((m) => m.status === "posted"),
    [matches]
  )

  // headline aggregates across every posted match
  const stats = useMemo(() => {
    let high = 0
    let scoreSum = 0
    let alliances = 0
    let boulders = 0
    for (const m of posted) {
      for (const pts of [m.redPoints, m.bluePoints]) {
        if (pts === null) continue
        alliances += 1
        scoreSum += pts
        if (pts > high) high = pts
      }
      boulders +=
        (totalsOf(m.redScore)?.boulders ?? 0) +
        (totalsOf(m.blueScore)?.boulders ?? 0)
    }
    return {
      played: posted.length,
      high,
      avg: alliances > 0 ? Math.round(scoreSum / alliances) : 0,
      boulders,
    }
  }, [posted])

  // scoring over time: red/blue points per posted match in play order
  const scoringData = useMemo(
    () =>
      posted.map((m) => ({
        label: matchLabel(m),
        red: m.redPoints ?? 0,
        blue: m.bluePoints ?? 0,
      })),
    [posted]
  )

  // ranking-points trend: cumulative earned RP for the top 5 teams, match by match
  const { trendData, trendTeams } = useMemo(
    () => buildRpTrend(matches, rankings),
    [matches, rankings]
  )
  const trendConfig = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        trendTeams.map((t, i) => [
          `t${t.number}`,
          {
            label: `${t.number}`,
            color: TREND_COLORS[i % TREND_COLORS.length],
          },
        ])
      ),
    [trendTeams]
  )

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Matches played" value={stats.played} />
        <StatTile label="High score" value={stats.high} />
        <StatTile label="Avg alliance score" value={stats.avg} />
        <StatTile label="Total boulders" value={stats.boulders} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scoring over time</CardTitle>
        </CardHeader>
        <CardContent>
          {scoringData.length > 0 ? (
            <ChartContainer
              config={scoringConfig}
              className="aspect-video max-h-72 w-full"
            >
              <AreaChart
                data={scoringData}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  width={28}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="red"
                  type="monotone"
                  stroke="var(--color-red)"
                  fill="var(--color-red)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  dataKey="blue"
                  type="monotone"
                  stroke="var(--color-blue)"
                  fill="var(--color-blue)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <Empty>Scores will chart here once matches are posted.</Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ranking points trend
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              top {trendTeams.length} teams
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length > 1 && trendTeams.length > 0 ? (
            <ChartContainer
              config={trendConfig}
              className="aspect-video max-h-72 w-full"
            >
              <LineChart
                data={trendData}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  width={28}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                {trendTeams.map((t) => (
                  <Line
                    key={t.teamId}
                    dataKey={`t${t.number}`}
                    type="monotone"
                    stroke={`var(--color-t${t.number})`}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          ) : (
            <Empty>
              Ranking points will chart here once qualification matches are
              posted.
            </Empty>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
    </div>
  )
}

/**
 * Replay posted qualification matches in play order, accumulating earned
 * ranking points (`redRP`/`blueRP`) per team. Returns one data point per posted
 * qual match with the cumulative total for each of the current top-5 teams,
 * carrying forward a team's last value through matches it didn't play.
 */
function buildRpTrend(matches: PublicMatch[], rankings: Ranking[]) {
  const trendTeams = rankings.slice(0, 5)
  const tracked = new Map(trendTeams.map((t) => [t.teamId, t.number]))
  const cum = new Map<string, number>(trendTeams.map((t) => [t.teamId, 0]))

  const seed: Record<string, number | string> = { label: "Start" }
  for (const t of trendTeams) seed[`t${t.number}`] = 0
  const trendData: Record<string, number | string>[] = [seed]

  const postedQuals = matches.filter(
    (m) => m.type === "qualification" && m.status === "posted"
  )
  for (const m of postedQuals) {
    const apply = (ids: (string | null)[], rp: number) => {
      for (const id of ids) {
        if (id && tracked.has(id)) cum.set(id, (cum.get(id) ?? 0) + rp)
      }
    }
    apply([m.red1, m.red2, m.red3], m.redRP ?? 0)
    apply([m.blue1, m.blue2, m.blue3], m.blueRP ?? 0)

    const point: Record<string, number | string> = { label: matchLabel(m) }
    for (const t of trendTeams) point[`t${t.number}`] = cum.get(t.teamId) ?? 0
    trendData.push(point)
  }

  return { trendData, trendTeams }
}

// ── team tab: per-team overview + history ────────────────────────────────────

const teamPointsConfig = {
  own: { label: "Points", color: "var(--chart-1)" },
  opp: { label: "Opponent", color: "var(--chart-2)" },
} satisfies ChartConfig

function TeamTab({
  matches,
  rankings,
  teamById,
  selectedTeamId,
  onSelectTeam,
}: {
  matches: PublicMatch[]
  rankings: Ranking[]
  teamById: Map<string, PublicTeam>
  selectedTeamId: string | null
  onSelectTeam: (teamId: string) => void
}) {
  // default to the top-ranked team when nothing has been picked yet
  const activeId: string | null =
    selectedTeamId ?? (rankings.length > 0 ? rankings[0].teamId : null)
  const ranking = rankings.find((r) => r.teamId === activeId) ?? null
  const team = activeId ? teamById.get(activeId) : undefined

  const history = useMemo(
    () => (activeId ? teamHistory(matches, activeId) : []),
    [matches, activeId]
  )
  const played = history.filter((h) => h.ownPoints !== null)
  const pointsData = played.map((h) => ({
    label: h.label,
    own: h.ownPoints ?? 0,
    opp: h.oppPoints ?? 0,
  }))

  if (!activeId || !ranking || !team) {
    return <Empty>No teams to show yet.</Empty>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={activeId} onValueChange={onSelectTeam}>
          <SelectTrigger className="w-auto min-w-56 font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rankings.map((r) => (
              <SelectItem key={r.teamId} value={r.teamId}>
                {r.number} — {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <TeamCards cards={team.cards} size="sm" />
        {team.participants.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {team.participants.join(" · ")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Rank" value={ranking.rank} />
        <StatTile label="Ranking pts" value={ranking.rankingPoints} />
        <StatTile label="Wins" value={ranking.wins} />
        <StatTile label="Played" value={ranking.matchesPlayed} />
        <StatTile label="Auto pts" value={ranking.autoPoints} />
        <StatTile label="Endgame pts" value={ranking.endgamePoints} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Points by match</CardTitle>
        </CardHeader>
        <CardContent>
          {pointsData.length > 0 ? (
            <ChartContainer
              config={teamPointsConfig}
              className="aspect-video max-h-72 w-full"
            >
              <LineChart
                data={pointsData}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  width={28}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  dataKey="own"
                  type="monotone"
                  stroke="var(--color-own)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  dataKey="opp"
                  type="monotone"
                  stroke="var(--color-opp)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <Empty>Points chart here once this team plays a match.</Empty>
          )}
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Match</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Margin</TableHead>
            <TableHead>Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No matches yet.
              </TableCell>
            </TableRow>
          )}
          {history.map((row) => {
            const diff =
              row.ownPoints !== null
                ? row.ownPoints - (row.oppPoints ?? 0)
                : null
            return (
              <TableRow key={row.matchId}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell>
                  <span
                    className="font-bold"
                    style={{ color: `var(--alliance-${row.side})` }}
                  >
                    {row.side.toUpperCase()}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {row.ownPoints !== null
                    ? `${row.ownPoints}–${row.oppPoints}`
                    : "—"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {diff !== null ? (
                    <span
                      className={
                        diff > 0
                          ? "text-emerald-600"
                          : diff < 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {row.result ? (
                    <Badge
                      variant={
                        row.result === "win"
                          ? "default"
                          : row.result === "tie"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {row.result}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{row.status}</Badge>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/** every match a team appears in, with own/opponent points and result */
function teamHistory(matches: PublicMatch[], teamId: string) {
  const rows: {
    matchId: string
    label: string
    side: Alliance
    status: string
    ownPoints: number | null
    oppPoints: number | null
    result: "win" | "loss" | "tie" | null
  }[] = []
  for (const m of matches) {
    const onRed = [m.red1, m.red2, m.red3].includes(teamId)
    const onBlue = [m.blue1, m.blue2, m.blue3].includes(teamId)
    if (!onRed && !onBlue) continue
    const side: Alliance = onRed ? "red" : "blue"
    const posted = m.status === "posted"
    const ownPoints = posted
      ? side === "red"
        ? m.redPoints
        : m.bluePoints
      : null
    const oppPoints = posted
      ? side === "red"
        ? m.bluePoints
        : m.redPoints
      : null
    let result: "win" | "loss" | "tie" | null = null
    if (posted && m.winner) {
      result = m.winner === "tie" ? "tie" : m.winner === side ? "win" : "loss"
    }
    rows.push({
      matchId: m.id,
      label: matchLabel(m),
      side,
      status: m.status,
      ownPoints,
      oppPoints,
      result,
    })
  }
  return rows
}

// ── schedule match row (unchanged behaviour) ─────────────────────────────────

function MatchRow({
  match,
  isCurrent,
  running,
  teamById,
  order,
}: {
  match: PublicMatch
  isCurrent: boolean
  running: boolean
  teamById: Map<string, PublicTeam>
  order: readonly [Alliance, Alliance]
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border p-3",
        isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <Badge variant="secondary" className="font-mono tabular-nums">
        {matchLabel(match)}
      </Badge>
      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {order.map((side, idx) => (
          <span
            key={side}
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            {idx > 0 && (
              <span className="text-xs font-medium text-muted-foreground">
                vs
              </span>
            )}
            <AllianceTeams
              color={side}
              teamIds={
                side === "red"
                  ? [match.red1, match.red2, match.red3, match.red4]
                  : [match.blue1, match.blue2, match.blue3, match.blue4]
              }
              teamById={teamById}
            />
          </span>
        ))}
      </div>
      <MatchStatusBadge
        match={match}
        isCurrent={isCurrent}
        running={running}
        order={order}
      />
    </div>
  )
}

function AllianceTeams({
  color,
  teamIds,
  teamById,
}: {
  color: "red" | "blue"
  teamIds: (string | null)[]
  teamById: Map<string, PublicTeam>
}) {
  const teams = teamIds
    .map((id) => (id ? teamById.get(id) : undefined))
    .filter((t): t is PublicTeam => t !== undefined)
  const style = {
    color: `var(--alliance-${color})`,
    borderColor: `color-mix(in oklch, var(--alliance-${color}) 45%, transparent)`,
  }

  if (teams.length === 0) {
    return <span className="text-xs text-muted-foreground">TBD</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {teams.map((team) => (
        <span key={team.teamId} className="inline-flex items-center gap-1">
          <Badge
            variant="outline"
            className={cn(
              "font-mono font-semibold tabular-nums",
              team.cards.disqualified && "line-through opacity-50"
            )}
            style={style}
            title={team.name}
          >
            {team.number}
          </Badge>
          <TeamCards cards={team.cards} size="sm" />
        </span>
      ))}
    </div>
  )
}

function MatchStatusBadge({
  match,
  isCurrent,
  running,
  order,
}: {
  match: PublicMatch
  isCurrent: boolean
  running: boolean
  order: readonly [Alliance, Alliance]
}) {
  if (isCurrent && running) {
    return <Badge className="bg-emerald-600 text-white">Now playing</Badge>
  }
  if (isCurrent) {
    return <Badge className="bg-amber-500 text-black">Queued</Badge>
  }
  if (match.status === "posted" || match.status === "scored") {
    return (
      <Badge variant="outline" className="font-mono tabular-nums">
        {order
          .map((s) =>
            s === "red" ? (match.redPoints ?? 0) : (match.bluePoints ?? 0)
          )
          .join("–")}
      </Badge>
    )
  }
  return <Badge variant="outline">Upcoming</Badge>
}
