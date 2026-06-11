import { useMemo, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
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
import { Checkbox } from "@/components/ui/checkbox"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  addParticipant,
  createTeam,
  deleteTeam,
  listTeams,
  provisionTeamAccount,
  removeParticipant,
} from "@/server/functions/teams"
import { KeyRoundIcon, ListPlusIcon, PlusIcon, Trash2Icon } from "lucide-react"

export const Route = createFileRoute("/admin/teams")({
  loader: () => listTeams(),
  component: TeamsPage,
})

type Team = Awaited<ReturnType<typeof listTeams>>[number]

function TeamsPage() {
  const teams = Route.useLoaderData()
  const router = useRouter()
  const createFn = useServerFn(createTeam)
  const deleteFn = useServerFn(deleteTeam)
  const [createOpen, setCreateOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false)
  const [credsFor, setCredsFor] = useState<Team | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Team | null>(null)

  const allSelected = teams.length > 0 && selected.size === teams.length
  const someSelected = selected.size > 0 && !allSelected

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(teams.map((t) => t.id)))
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-medium">Teams</h1>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setPendingBulkDelete(true)}
            >
              <Trash2Icon />
              Delete {selected.size} team{selected.size !== 1 ? "s" : ""}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            <ListPlusIcon />
            Bulk add
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusIcon />
                New team
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Create team</DialogTitle>
                <DialogDescription>
                  The two-digit team number doubles as the team's login
                  username.
                </DialogDescription>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const form = new FormData(e.currentTarget)
                  try {
                    await createFn({
                      data: {
                        number: Number(form.get("number")),
                        name: String(form.get("name")),
                      },
                    })
                    setCreateOpen(false)
                    await router.invalidate()
                  } catch {
                    toast.error("Could not create team — is the number unique?")
                  }
                }}
              >
                <div className="flex gap-2">
                  <div className="flex w-24 flex-col gap-1.5">
                    <Label htmlFor="number">Number</Label>
                    <Input
                      id="number"
                      name="number"
                      type="number"
                      min={1}
                      max={99}
                      required
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" required />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">Create</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <BulkAddDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          onDone={() => router.invalidate()}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                checked={
                  allSelected ? true : someSelected ? "indeterminate" : false
                }
                onCheckedChange={toggleAll}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead>#</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Participants</TableHead>
            <TableHead>Login</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team) => (
            <TeamRow
              key={team.id}
              team={team}
              selected={selected.has(team.id)}
              onSelect={() => toggleOne(team.id)}
              onProvision={() => setCredsFor(team)}
              onDelete={() => setPendingDelete(team)}
            />
          ))}
        </TableBody>
      </Table>

      {credsFor && (
        <ProvisionDialog team={credsFor} onClose={() => setCredsFor(null)} />
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete team {pendingDelete?.number} {pendingDelete?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Removes the team, its participants, and its login account. Match
              history that references this team will show an unknown team.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDelete) return
                await deleteFn({ data: { id: pendingDelete.id } })
                setPendingDelete(null)
                toast.success("Team deleted")
                await router.invalidate()
              }}
            >
              Delete team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingBulkDelete}
        onOpenChange={(open) => !open && setPendingBulkDelete(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.size} team{selected.size !== 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Removes each selected team, its participants, and its login
              account. Match history that references these teams will show
              unknown teams.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const ids = [...selected]
                for (const id of ids) {
                  await deleteFn({ data: { id } })
                }
                setSelected(new Set())
                setPendingBulkDelete(false)
                toast.success(
                  `${ids.length} team${ids.length !== 1 ? "s" : ""} deleted`
                )
                await router.invalidate()
              }}
            >
              Delete {selected.size} team{selected.size !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function TeamRow({
  team,
  selected,
  onSelect,
  onProvision,
  onDelete,
}: {
  team: Team
  selected: boolean
  onSelect: () => void
  onProvision: () => void
  onDelete: () => void
}) {
  const router = useRouter()
  const addParticipantFn = useServerFn(addParticipant)
  const removeParticipantFn = useServerFn(removeParticipant)

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select team ${team.number}`}
        />
      </TableCell>
      <TableCell className="font-mono">{team.number}</TableCell>
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
              const formElement = e.currentTarget
              const name = String(new FormData(formElement).get("participant"))
              if (!name) return
              formElement.reset()
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
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          title="Set team login"
          onClick={onProvision}
        >
          <KeyRoundIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Delete team"
          onClick={onDelete}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}

function ProvisionDialog({
  team,
  onClose,
}: {
  team: Team
  onClose: () => void
}) {
  const router = useRouter()
  const provisionFn = useServerFn(provisionTeamAccount)
  const [creds, setCreds] = useState<{
    username: string
    password: string
  } | null>(null)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {team.hasAccount ? "Reset" : "Create"} login for team {team.number}
          </DialogTitle>
          <DialogDescription>
            The username is always the team number (
            {String(team.number).padStart(2, "0")}). Set a custom password or
            leave blank to generate one.
          </DialogDescription>
        </DialogHeader>
        {creds ? (
          <>
            <p className="bg-muted p-3 font-mono text-sm">
              username: {creds.username}
              <br />
              password: {creds.password}
            </p>
            <DialogDescription>
              Share these with the team — the password is shown only once.
            </DialogDescription>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              const custom = String(
                new FormData(e.currentTarget).get("password")
              ).trim()
              try {
                const result = await provisionFn({
                  data: { teamId: team.id, password: custom || undefined },
                })
                setCreds(result)
                await router.invalidate()
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : String(error)
                )
              }
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Custom password (optional)</Label>
              <Input
                id="password"
                name="password"
                type="text"
                minLength={4}
                placeholder="leave blank to auto-generate"
              />
            </div>
            <DialogFooter>
              <Button type="submit">
                {team.hasAccount ? "Reset login" : "Create login"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface ParsedRow {
  number: number
  name: string
  participants: string[]
  error: string | null
}

function parseInput(raw: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  const seen = new Set<number>()

  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // prefer comma or tab as separator; fall back to whitespace
    const fields =
      trimmed.includes(",") || trimmed.includes("\t")
        ? trimmed
            .split(/[,\t]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : trimmed.split(/\s+/)

    const number = parseInt(fields[0] ?? "", 10)
    const name = fields[1] ?? ""
    const participants = fields.slice(2).filter(Boolean)

    let error: string | null = null
    if (!fields[0] || isNaN(number) || number <= 0) {
      error = "Invalid team number"
    } else if (!name) {
      error = "Missing team name"
    } else if (seen.has(number)) {
      error = "Duplicate number"
    }

    if (!error) seen.add(number)
    rows.push({ number, name, participants, error })
  }

  return rows
}

function BulkAddDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const createFn = useServerFn(createTeam)
  const addParticipantFn = useServerFn(addParticipant)
  const [raw, setRaw] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  const rows = useMemo(() => parseInput(raw), [raw])
  const validRows = rows.filter((r) => r.error === null)
  const hasErrors = rows.some((r) => r.error !== null)

  async function handleSubmit() {
    if (validRows.length === 0) return
    setSubmitting(true)
    let failed = 0
    for (const row of validRows) {
      setProgress(`Creating team ${row.number}…`)
      try {
        const team = await createFn({
          data: { number: row.number, name: row.name },
        })
        for (const name of row.participants) {
          await addParticipantFn({ data: { teamId: team.id, name } })
        }
      } catch {
        failed++
        toast.error(`Team ${row.number} already exists — skipped`)
      }
    }
    setSubmitting(false)
    setProgress(null)
    setRaw("")
    onOpenChange(false)
    onDone()
    if (failed === 0)
      toast.success(
        `${validRows.length} team${validRows.length !== 1 ? "s" : ""} added`
      )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) {
          onOpenChange(o)
          if (!o) setRaw("")
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk add teams</DialogTitle>
          <DialogDescription>
            Paste one team per line. Each line: number, name, and optional
            participant names — separated by commas, tabs, or spaces.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Textarea
            placeholder={`12, Voltage Vultures, Alice, Bob\n34, Spark Squad, Carol\n56  Iron Hawks`}
            className="font-mono text-sm"
            rows={6}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            disabled={submitting}
          />

          {rows.length > 0 && (
            <ScrollArea className="h-56 border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Participants</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow
                      key={i}
                      className={row.error ? "bg-destructive/10" : undefined}
                    >
                      <TableCell className="font-mono">
                        {row.error ? (
                          <span className="text-xs text-destructive">
                            {row.error}
                          </span>
                        ) : (
                          row.number
                        )}
                      </TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.participants.join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          {progress && (
            <p className="text-sm text-muted-foreground">{progress}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {hasErrors && (
            <p className="mr-auto text-sm text-destructive">
              {rows.filter((r) => r.error).length} row
              {rows.filter((r) => r.error).length !== 1 ? "s" : ""} with errors
              will be skipped
            </p>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={validRows.length === 0 || submitting}
          >
            Add{" "}
            {validRows.length > 0
              ? `${validRows.length} team${validRows.length !== 1 ? "s" : ""}`
              : "teams"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
