import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
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

const chartConfig = {
  red: { label: "Red alliance", color: "var(--alliance-red, #dc2626)" },
  blue: { label: "Blue alliance", color: "var(--alliance-blue, #2563eb)" },
} satisfies ChartConfig

export function MatchPointsChart({
  data,
}: {
  data: { label: string; eventName: string; red: number; blue: number }[]
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Match points</CardTitle>
        <CardDescription>
          Alliance points for the last {data.length} posted matches
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {data.length === 0 ? (
          <p className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No posted matches yet — scores will chart here as matches finish.
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[200px] w-full"
          >
            <AreaChart data={data}>
              <defs>
                <linearGradient id="fillRed" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-red)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-red)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
                <linearGradient id="fillBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-blue)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-blue)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value, payload) => {
                      const item = payload[0]?.payload as
                        | { eventName?: string }
                        | undefined
                      return item?.eventName
                        ? `${value} — ${item.eventName}`
                        : String(value)
                    }}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="blue"
                type="natural"
                fill="url(#fillBlue)"
                stroke="var(--color-blue)"
              />
              <Area
                dataKey="red"
                type="natural"
                fill="url(#fillRed)"
                stroke="var(--color-red)"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
