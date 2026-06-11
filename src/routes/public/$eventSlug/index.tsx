import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { BracketGraphic } from "@/components/bracket/bracket-graphic"
import { SelectionBoard } from "@/components/selection-board"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { getDisplayBootstrap } from "@/server/functions/display"
import { ALLIANCE_ORDER } from "@/shared/alliance"
import { matchShortLabel } from "@/shared/match-format"
import { topicFor } from "@/shared/realtime-messages"
import { TvIcon } from "lucide-react"

export const Route = createFileRoute("/public/$eventSlug/")({
  loader: ({ params }) =>
    getDisplayBootstrap({ data: { slug: params.eventSlug } }),
  component: PublicEventPage,
})

function PublicEventPage() {
  const boot = Route.useLoaderData()
  const router = useRouter()
  const { eventSlug } = Route.useParams()

  // anything that changes standings, alliances, or the field refreshes the data
  useRealtime([topicFor(boot.event.id, "public")], (message) => {
    if (
      message.type === "score_update" ||
      message.type === "selection_update" ||
      message.type === "bracket_update" ||
      message.type === "match_state"
    ) {
      void router.invalidate()
    }
  })

  const selectionStarted =
    boot.selection.complete ||
    boot.selection.alliances.some((a) => a.captain !== null)

  const teamById = new Map(boot.teams.map((t) => [t.teamId, t]))

  return (
    <main className="mx-auto flex min-h-svh max-w-4xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">{boot.event.name}</h1>
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

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="alliances">Alliances</TabsTrigger>
          <TabsTrigger value="bracket">Bracket</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="flex flex-col gap-2 pt-2">
          {boot.matches.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No matches scheduled yet.
            </p>
          ) : (
            boot.matches.map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                isCurrent={match.id === boot.field.matchId}
                running={boot.field.running}
                teamById={teamById}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="rankings">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Avg RP</TableHead>
                <TableHead className="text-right">W-L-T</TableHead>
                <TableHead className="text-right">Played</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boot.rankings.map((row) => (
                <TableRow key={row.teamId}>
                  <TableCell className="font-bold tabular-nums">
                    {row.rank}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono font-bold">{row.number}</span>{" "}
                    {row.name}
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
                    {row.matchesPlayed}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="teams">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Participants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boot.teams.map((team) => (
                <TableRow key={team.teamId}>
                  <TableCell className="font-mono font-bold">
                    {team.number}
                  </TableCell>
                  <TableCell>{team.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {team.participants.join(" · ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="alliances" className="@container/board pt-2">
          {selectionStarted ? (
            <SelectionBoard state={boot.selection} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              Alliance selection hasn't started yet.
            </p>
          )}
        </TabsContent>

        <TabsContent value="bracket" className="pt-2">
          <BracketGraphic bracket={boot.bracket} />
        </TabsContent>
      </Tabs>
    </main>
  )
}

type PublicMatch =
  ReturnType<typeof getDisplayBootstrap> extends Promise<infer R>
    ? R extends { matches: (infer M)[] }
      ? M
      : never
    : never

type PublicTeam =
  ReturnType<typeof getDisplayBootstrap> extends Promise<infer R>
    ? R extends { teams: (infer T)[] }
      ? T
      : never
    : never

const matchLabel = matchShortLabel

function MatchRow({
  match,
  isCurrent,
  running,
  teamById,
}: {
  match: PublicMatch
  isCurrent: boolean
  running: boolean
  teamById: Map<string, PublicTeam>
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
        {ALLIANCE_ORDER.map((side, idx) => (
          <span key={side} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {idx > 0 && (
              <span className="text-xs font-medium text-muted-foreground">
                vs
              </span>
            )}
            <AllianceTeams
              color={side}
              teamIds={
                side === "red"
                  ? [match.red1, match.red2, match.red3]
                  : [match.blue1, match.blue2, match.blue3]
              }
              teamById={teamById}
            />
          </span>
        ))}
      </div>
      <MatchStatusBadge match={match} isCurrent={isCurrent} running={running} />
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
    <div className="flex flex-wrap gap-1.5">
      {teams.map((team) => (
        <Badge
          key={team.teamId}
          variant="outline"
          className="font-mono font-semibold tabular-nums"
          style={style}
          title={team.name}
        >
          {team.number}
        </Badge>
      ))}
    </div>
  )
}

function MatchStatusBadge({
  match,
  isCurrent,
  running,
}: {
  match: PublicMatch
  isCurrent: boolean
  running: boolean
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
        {ALLIANCE_ORDER.map((s) =>
          s === "red" ? (match.redPoints ?? 0) : (match.bluePoints ?? 0)
        ).join("–")}
      </Badge>
    )
  }
  return <Badge variant="outline">Upcoming</Badge>
}
