import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import {
  createEvent,
  deleteEvent,
  duplicateEvent,
  listEvents,
} from "@/server/functions/events"
import { CopyIcon, PlusIcon, Trash2Icon } from "lucide-react"

export const Route = createFileRoute("/admin/events/")({
  loader: () => listEvents(),
  component: EventsPage,
})

function EventsPage() {
  const events = Route.useLoaderData()
  const router = useRouter()
  const createFn = useServerFn(createEvent)
  const deleteFn = useServerFn(deleteEvent)
  const duplicateFn = useServerFn(duplicateEvent)
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    name: string
  } | null>(null)
  const [duplicateSource, setDuplicateSource] = useState<{
    id: string
    name: string
  } | null>(null)
  const [duplicateName, setDuplicateName] = useState("")
  const [duplicating, setDuplicating] = useState(false)

  function openDuplicate(event: { id: string; name: string }) {
    setDuplicateSource({ id: event.id, name: event.name })
    setDuplicateName(`${event.name} (copy)`)
  }

  async function submitDuplicate(e: React.FormEvent) {
    e.preventDefault()
    if (!duplicateSource || !duplicateName.trim()) return
    setDuplicating(true)
    try {
      await duplicateFn({
        data: { sourceEventId: duplicateSource.id, name: duplicateName.trim() },
      })
      setDuplicateSource(null)
      toast.success("Event duplicated")
      await router.invalidate()
    } catch {
      toast.error("Could not duplicate event — is the name unique?")
    } finally {
      setDuplicating(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-medium">Events</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <PlusIcon />
              New event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Create event</DialogTitle>
              <DialogDescription>
                The event URL is derived from its name (e.g. “Spring Open” →{" "}
                <span className="font-mono">/events/spring-open</span>).
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault()
                const form = new FormData(e.currentTarget)
                try {
                  await createFn({ data: { name: String(form.get("name")) } })
                  setCreateOpen(false)
                  await router.invalidate()
                } catch {
                  toast.error("Could not create event — is the name unique?")
                }
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required autoFocus />
              </div>
              <DialogFooter>
                <Button type="submit">Create</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>
                <Link
                  to="/admin/events/$eventSlug"
                  params={{ eventSlug: event.slug }}
                  className="font-medium hover:underline"
                >
                  {event.name}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-muted-foreground">
                /{event.slug}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    event.status === "complete" ? "secondary" : "default"
                  }
                >
                  {event.status.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  title={`Duplicate ${event.name}`}
                  onClick={() => openDuplicate(event)}
                >
                  <CopyIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={`Delete ${event.name}`}
                  onClick={() =>
                    setPendingDelete({ id: event.id, name: event.name })
                  }
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={duplicateSource !== null}
        onOpenChange={(open) => !open && setDuplicateSource(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicate event</DialogTitle>
            <DialogDescription>
              Creates a new event with {duplicateSource?.name}’s team roster and
              settings. Matches, scores, alliances, and cards are not copied.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={submitDuplicate}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="duplicate-name">New name</Label>
              <Input
                id="duplicate-name"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={duplicating}>
                Duplicate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the event with its roster, schedule, and
              every recorded score. Teams themselves are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDelete) return
                await deleteFn({ data: { eventId: pendingDelete.id } })
                setPendingDelete(null)
                toast.success("Event deleted")
                await router.invalidate()
              }}
            >
              Delete event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
