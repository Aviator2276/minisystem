import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  XAxis,
  YAxis,
} from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { useRealtime } from "@/hooks/use-realtime"
import { selectionRespond } from "@/server/functions/selection"
import { getTeamDashboard } from "@/server/functions/team-stats"
import { topicFor } from "@/shared/realtime-messages"

const chartConfig = {
  value: { label: "vs event best", color: "var(--primary)" },
} satisfies ChartConfig

const pointsConfig = {
  own: { label: "Your alliance", color: "var(--chart-1)" },
  opp: { label: "Opponent", color: "var(--chart-2)" },
} satisfies ChartConfig

export const Route = createFileRoute("/team/")({
  validateSearch: (search: Record<string, unknown>): { event?: string } => ({
    event: typeof search.event === "string" ? search.event : undefined,
  }),
  loaderDeps: ({ search }) => ({ event: search.event }),
  loader: ({ deps }) => getTeamDashboard({ data: { eventId: deps.event } }),
  component: TeamDashboard,
})

function TeamDashboard() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const respondFn = useServerFn(selectionRespond)

  // coarse but effective: any public update may change rankings/selection
  useRealtime(
    data.event ? [topicFor(data.event.id, "public")] : [],
    (message) => {
      if (
        message.type === "selection_update" ||
        message.type === "score_update"
      ) {
        void router.invalidate()
      }
    }
  )

  if (!data.event) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>
            Team {data.team.number} — {data.team.name}
          </CardTitle>
          <CardDescription>
            Your team isn't registered for any event yet. Stats, schedule, and
            alliance invites will appear here once you are.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // the points chart + headline stats only consider scored matches
  const played = data.schedule.filter((r) => r.ownPoints !== null)
  const pointsData = played.map((r) => ({
    label: r.label,
    own: r.ownPoints ?? 0,
    opp: r.oppPoints ?? 0,
  }))
  const avgOwn = played.length
    ? Math.round(
        played.reduce((s, r) => s + (r.ownPoints ?? 0), 0) / played.length
      )
    : 0
  const highOwn = played.length
    ? Math.max(...played.map((r) => r.ownPoints ?? 0))
    : 0

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold">
          Team {data.team.number} — {data.team.name}
        </h1>
        {data.team.participants.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {data.team.participants.join(" · ")}
          </span>
        )}
        <div className="ml-auto">
          <Select
            value={data.event.id}
            onValueChange={(eventId) =>
              router.navigate({ to: "/team", search: { event: eventId } })
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {data.invite && (
        <Card className="border-2 border-dashed border-primary">
          <CardHeader>
            <CardTitle>
              Alliance {data.invite.allianceNumber} invites you!
            </CardTitle>
            <CardDescription>
              Accepting joins their playoff alliance. Declining means no other
              alliance can pick you for the rest of selection.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              onClick={async () => {
                try {
                  await respondFn({
                    data: { eventId: data.event.id, response: "accept" },
                  })
                  toast.success("Welcome to the alliance!")
                  await router.invalidate()
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : String(error)
                  )
                }
              }}
            >
              Accept
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await respondFn({
                    data: { eventId: data.event.id, response: "decline" },
                  })
                  await router.invalidate()
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : String(error)
                  )
                }
              }}
            >
              Decline
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Rank</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums">
              {data.rank ? `${data.rank.rank}` : "—"}
              {data.rank && (
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  / {data.rank.of}
                </span>
              )}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                {data.event.status.replace("_", " ")}
              </Badge>
            </CardAction>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Record</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums">
              {data.rank
                ? `${data.rank.wins}-${data.rank.losses}-${data.rank.ties}`
                : "0-0-0"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Alliance</CardDescription>
            <CardTitle className="text-3xl font-semibold">
              {data.allianceNumber !== null ? `#${data.allianceNumber}` : "—"}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">{data.selectionStatus}</Badge>
            </CardAction>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Performance profile</CardTitle>
            <CardDescription>Alliance-level average</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-square max-h-72 w-full"
            >
              <RadarChart
                data={data.radar}
                outerRadius="70%"
                margin={{ top: 16, right: 16, bottom: 16, left: 16 }}
              >
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(value, _name, item) => {
                        const raw = (item.payload as { raw?: number }).raw ?? 0
                        return `${value}% of event best (avg ${raw.toFixed(1)})`
                      }}
                    />
                  }
                />
                <PolarGrid />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <Radar
                  dataKey="value"
                  fill="var(--color-value)"
                  fillOpacity={0.5}
                  stroke="var(--color-value)"
                />
              </RadarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Points by match</CardTitle>
            <CardDescription>
              {played.length > 0
                ? `Avg ${avgOwn} · High ${highOwn} · ${played.length} scored`
                : "No scored matches yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {played.length > 0 ? (
              <ChartContainer
                config={pointsConfig}
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
              <p className="py-12 text-center text-sm text-muted-foreground">
                Your points will chart here once matches are scored.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schedule & results</CardTitle>
          <CardDescription>
            {data.schedule.length} match
            {data.schedule.length === 1 ? "" : "es"} · {data.event.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              {data.schedule.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No matches scheduled yet.
                  </TableCell>
                </TableRow>
              )}
              {data.schedule.map((row) => {
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
                        style={{
                          color:
                            row.side === "red"
                              ? "var(--alliance-red)"
                              : "var(--alliance-blue)",
                        }}
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
        </CardContent>
      </Card>
    </div>
  )
}
