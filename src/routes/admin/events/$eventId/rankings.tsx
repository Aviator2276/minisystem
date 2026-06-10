import { createFileRoute } from "@tanstack/react-router"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getRankings } from "@/server/functions/rankings"

export const Route = createFileRoute("/admin/events/$eventId/rankings")({
  loader: ({ params }) => getRankings({ data: { eventId: params.eventId } }),
  component: RankingsPage,
})

function RankingsPage() {
  const rankings = Route.useLoaderData()

  return (
    <div className="max-w-3xl">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Avg RP</TableHead>
            <TableHead>W-L-T</TableHead>
            <TableHead>Auto</TableHead>
            <TableHead>Endgame</TableHead>
            <TableHead>Boulders</TableHead>
            <TableHead>Played</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rankings.map((row) => (
            <TableRow key={row.teamId}>
              <TableCell className="font-medium">{row.rank}</TableCell>
              <TableCell>
                {row.number} {row.name}
              </TableCell>
              <TableCell className="font-mono">
                {row.matchesPlayed > 0
                  ? (row.rp / row.matchesPlayed).toFixed(2)
                  : "0.00"}
              </TableCell>
              <TableCell className="font-mono">
                {row.wins}-{row.losses}-{row.ties}
              </TableCell>
              <TableCell className="font-mono">{row.autoPoints}</TableCell>
              <TableCell className="font-mono">{row.endgamePoints}</TableCell>
              <TableCell className="font-mono">{row.boulders}</TableCell>
              <TableCell className="font-mono">{row.matchesPlayed}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
