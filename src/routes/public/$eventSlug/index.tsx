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
import { getDisplayBootstrap } from "@/server/functions/display"
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

  // anything that changes standings or alliances refreshes the page data
  useRealtime([topicFor(boot.event.id, "public")], (message) => {
    if (
      message.type === "score_update" ||
      message.type === "selection_update" ||
      message.type === "bracket_update"
    ) {
      void router.invalidate()
    }
  })

  const selectionStarted =
    boot.selection.complete ||
    boot.selection.alliances.some((a) => a.captain !== null)

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

      <Tabs defaultValue="rankings">
        <TabsList>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="alliances">Alliances</TabsTrigger>
          <TabsTrigger value="bracket">Bracket</TabsTrigger>
        </TabsList>

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
