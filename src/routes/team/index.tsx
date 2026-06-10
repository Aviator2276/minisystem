import { createFileRoute } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getCurrentUser } from "@/server/functions/auth"

export const Route = createFileRoute("/team/")({
  loader: () => getCurrentUser(),
  component: TeamHome,
})

// placeholder until P14 (team stats dashboard); proves team auth end-to-end
function TeamHome() {
  const user = Route.useLoaderData()

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Team {user?.username}</CardTitle>
        <CardDescription>
          Schedule, results, stats, and alliance invites will appear here once
          an event is underway.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          You're logged in as a team account.
        </p>
      </CardContent>
    </Card>
  )
}
