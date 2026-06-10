import { useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  addParticipant,
  createTeam,
  deleteTeam,
  listTeams,
  provisionTeamAccount,
  removeParticipant,
} from "@/server/functions/teams"

export const Route = createFileRoute("/admin/teams")({
  loader: () => listTeams(),
  component: TeamsPage,
})

function TeamsPage() {
  const teams = Route.useLoaderData()
  const router = useRouter()
  const createFn = useServerFn(createTeam)
  const [creds, setCreds] = useState<{
    username: string
    password: string
  } | null>(null)

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      await createFn({
        data: {
          number: Number(form.get("number")),
          name: String(form.get("name")),
        },
      })
      formElement.reset()
      await router.invalidate()
    } catch {
      toast.error("Could not create team — is the number unique?")
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-sm font-medium">Teams</h1>

      <form className="flex items-end gap-2" onSubmit={onCreate}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="number">Number</Label>
          <Input
            id="number"
            name="number"
            type="number"
            min={1}
            required
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required className="w-56" />
        </div>
        <Button type="submit">Add team</Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Participants</TableHead>
            <TableHead>Login</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team) => (
            <TeamRow key={team.id} team={team} onCreds={setCreds} />
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={creds !== null}
        onOpenChange={(open) => !open && setCreds(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Team account</DialogTitle>
            <DialogDescription>
              Share these credentials with the team — the password is shown only
              once.
            </DialogDescription>
          </DialogHeader>
          <p className="font-mono text-sm">
            username: {creds?.username}
            <br />
            password: {creds?.password}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TeamRow({
  team,
  onCreds,
}: {
  team: Awaited<ReturnType<typeof listTeams>>[number]
  onCreds: (creds: { username: string; password: string }) => void
}) {
  const router = useRouter()
  const provisionFn = useServerFn(provisionTeamAccount)
  const deleteFn = useServerFn(deleteTeam)
  const addParticipantFn = useServerFn(addParticipant)
  const removeParticipantFn = useServerFn(removeParticipant)

  return (
    <TableRow>
      <TableCell>{team.number}</TableCell>
      <TableCell>{team.name}</TableCell>
      <TableCell className="whitespace-normal">
        <span className="flex flex-wrap items-center gap-1">
          {team.participants.map((p) => (
            <Badge
              key={p.id}
              variant="secondary"
              className="cursor-pointer"
              title="Remove participant"
              onClick={async () => {
                await removeParticipantFn({ data: { id: p.id } })
                await router.invalidate()
              }}
            >
              {p.name} ×
            </Badge>
          ))}
          <form
            className="inline-flex"
            onSubmit={async (e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              const name = String(form.get("participant"))
              if (!name) return
              e.currentTarget.reset()
              await addParticipantFn({ data: { teamId: team.id, name } })
              await router.invalidate()
            }}
          >
            <Input
              name="participant"
              placeholder="+ name"
              className="h-6 w-24 text-[0.65rem]"
            />
          </form>
        </span>
      </TableCell>
      <TableCell>
        {team.hasAccount ? (
          <Badge>active</Badge>
        ) : (
          <Badge variant="outline">none</Badge>
        )}
      </TableCell>
      <TableCell className="flex justify-end gap-1">
        <Button
          variant="outline"
          size="xs"
          onClick={async () => {
            const creds = await provisionFn({ data: { teamId: team.id } })
            onCreds(creds)
            await router.invalidate()
          }}
        >
          {team.hasAccount ? "Reset login" : "Create login"}
        </Button>
        <Button
          variant="destructive"
          size="xs"
          onClick={async () => {
            if (!confirm(`Delete team ${team.number} ${team.name}?`)) return
            await deleteFn({ data: { id: team.id } })
            await router.invalidate()
          }}
        >
          Delete
        </Button>
      </TableCell>
    </TableRow>
  )
}
