import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createEvent, listEvents } from "@/server/functions/events"

export const Route = createFileRoute("/admin/events/")({
  loader: () => listEvents(),
  component: EventsPage,
})

function EventsPage() {
  const events = Route.useLoaderData()
  const router = useRouter()
  const createFn = useServerFn(createEvent)

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-sm font-medium">Events</h1>

      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          const formElement = e.currentTarget
          const form = new FormData(formElement)
          try {
            await createFn({ data: { name: String(form.get("name")) } })
            formElement.reset()
            await router.invalidate()
          } catch {
            toast.error("Could not create event — is the name unique?")
          }
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required className="w-64" />
        </div>
        <Button type="submit">Create event</Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>
                <Link
                  to="/admin/events/$eventId"
                  params={{ eventId: event.id }}
                  className="font-medium hover:underline"
                >
                  {event.name}
                </Link>
              </TableCell>
              <TableCell className="font-mono">{event.slug}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    event.status === "complete" ? "secondary" : "default"
                  }
                >
                  {event.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
