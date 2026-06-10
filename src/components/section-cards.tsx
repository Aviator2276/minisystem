import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  TrophyIcon,
  UsersIcon,
  ListChecksIcon,
  ActivityIcon,
} from "lucide-react"

export function SectionCards({
  teamCount,
  eventCount,
  postedMatchCount,
  scoreEventCount,
}: {
  teamCount: number
  eventCount: number
  postedMatchCount: number
  scoreEventCount: number
}) {
  const cards = [
    {
      description: "Teams",
      value: teamCount,
      icon: <UsersIcon />,
      footer: "Registered globally",
      detail: "Reusable across events",
    },
    {
      description: "Events",
      value: eventCount,
      icon: <TrophyIcon />,
      footer: "Created so far",
      detail: "Each with its own quals and playoffs",
    },
    {
      description: "Matches posted",
      value: postedMatchCount,
      icon: <ListChecksIcon />,
      footer: "Results saved",
      detail: "Counted toward rankings",
    },
    {
      description: "Scoring events",
      value: scoreEventCount,
      icon: <ActivityIcon />,
      footer: "Recorded by scorers",
      detail: "Timestamped event log",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {cards.map((card) => (
        <Card key={card.description} className="@container/card">
          <CardHeader>
            <CardDescription>{card.description}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {card.value}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">{card.icon}</Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              {card.footer}
            </div>
            <div className="text-muted-foreground">{card.detail}</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
