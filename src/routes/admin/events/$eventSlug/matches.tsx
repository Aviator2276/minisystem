import { useEffect, useState } from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  Loader2Icon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { getGame } from "@/games"
import { listEventTeams } from "@/server/functions/events"
import {
  createCustomMatch,
  deleteMatch,
  deleteMatches,
  generateMoreQualMatches,
  listMatches,
  regenerateQualSchedule,
  reorderMatches,
} from "@/server/functions/matches"
import { addExtraPlayoffMatch, extendFinals } from "@/server/functions/playoffs"
import {
  listScoreEvents,
  postMatch,
  recordScoreEvent,
  resetMatch,
  undoScoreEvent,
} from "@/server/functions/scoring"
import { getSelection } from "@/server/functions/selection"
import { allianceOrder } from "@/shared/alliance"
import type { Alliance } from "@/shared/alliance"
import {
  isExtraPlayoffMatch,
  matchShortLabel,
  sortMatchesByType,
} from "@/shared/match-format"
import { MANUAL_ADJUST_TYPE } from "@/shared/score-types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const Route = createFileRoute("/admin/events/$eventSlug/matches")({
  loader: async ({ context }) => {
    const [matches, roster, selection] = await Promise.all([
      listMatches({ data: { eventId: context.event.id } }),
      listEventTeams({ data: { eventId: context.event.id } }),
      // alliance rosters for the add-playoff-match dialog
      context.event.status === "playoffs"
        ? getSelection({ data: { eventId: context.event.id } })
        : Promise.resolve(null),
    ])
    return { event: context.event, matches, roster, selection }
  },
  component: MatchesPage,
})

type MatchRow = Awaited<ReturnType<typeof listMatches>>[number]

function MatchesPage() {
  const { event, matches, roster, selection } = Route.useLoaderData()
  const order = allianceOrder(event.settings.flipAllianceSides)
  const router = useRouter()
  const regenerateFn = useServerFn(regenerateQualSchedule)
  const generateMoreFn = useServerFn(generateMoreQualMatches)
  const deleteFn = useServerFn(deleteMatch)
  const deleteManyFn = useServerFn(deleteMatches)
  const [scoring, setScoring] = useState<MatchRow | null>(null)
  const [generating, setGenerating] = useState(false)
  const [pendingRounds, setPendingRounds] = useState<number | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [playoffOpen, setPlayoffOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<MatchRow | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)

  const canEdit = event.status === "setup" || event.status === "quals"
  const inPlayoffs = event.status === "playoffs"
  // playoffs still allow managing matches (extras, reorder, delete eligibles)
  const canManage = canEdit || inPlayoffs

  // local copy drives drag order, sorted by type (practice → quals →
  // playoffs) then play order; resyncs whenever the loader refetches
  const reorderFn = useServerFn(reorderMatches)
  const [rows, setRows] = useState<MatchRow[]>(() => sortMatchesByType(matches))
  useEffect(() => setRows(sortMatchesByType(matches)), [matches])

  // only non-running matches can be deleted, so only those are selectable
  const selectable = rows.filter((m) => m.status !== "running")
  const selectedIds = selectable
    .filter((m) => selected.has(m.id))
    .map((m) => m.id)
  const allSelected =
    selectable.length > 0 && selectedIds.length === selectable.length
  const someSelected = selectedIds.length > 0 && !allSelected

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((m) => m.id)))
  }

  async function runBulkDelete() {
    setBulkConfirm(false)
    try {
      const result = await deleteManyFn({
        data: { eventId: event.id, matchIds: selectedIds },
      })
      setSelected(new Set())
      toast.success(
        `Deleted ${result.deleted} match${result.deleted === 1 ? "" : "es"}` +
          (result.skipped > 0
            ? ` — skipped ${result.skipped} (posted or bracket matches)`
            : "")
      )
      await router.invalidate()
    } catch (error) {
      toast.error(String(error))
    }
  }

  async function runRegenerate(rounds: number) {
    setGenerating(true)
    try {
      await regenerateFn({ data: { eventId: event.id, roundsPerTeam: rounds } })
      await router.invalidate()
    } catch (error) {
      toast.error(String(error))
    } finally {
      setGenerating(false)
    }
  }

  async function runGenerateMore(rounds: number) {
    setGenerating(true)
    try {
      await generateMoreFn({
        data: { eventId: event.id, additionalRounds: rounds },
      })
      await router.invalidate()
    } catch (error) {
      toast.error(String(error))
    } finally {
      setGenerating(false)
    }
  }

  const sensors = useSensors(
    // a small drag threshold so clicking the grip doesn't start a phantom drag
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor)
  )

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const activeMatch = rows.find((m) => m.id === active.id)
    const overMatch = rows.find((m) => m.id === over.id)
    // keep the type groups intact — only reorder within a single group
    if (!activeMatch || !overMatch || activeMatch.type !== overMatch.type)
      return

    const next = arrayMove(
      rows,
      rows.indexOf(activeMatch),
      rows.indexOf(overMatch)
    )
    setRows(next) // optimistic
    try {
      await reorderFn({
        data: { eventId: event.id, orderedIds: next.map((m) => m.id) },
      })
      await router.invalidate()
    } catch (error) {
      toast.error(String(error))
      setRows(matches) // revert on failure
    }
  }

  // up/down arrows: swap with the neighboring match within the same type group
  async function moveMatch(match: MatchRow, direction: -1 | 1) {
    const index = rows.indexOf(match)
    const target = index + direction
    if (target < 0 || target >= rows.length) return
    if (rows[target].type !== match.type) return
    const next = arrayMove(rows, index, index + direction)
    setRows(next) // optimistic
    try {
      await reorderFn({
        data: { eventId: event.id, orderedIds: next.map((m) => m.id) },
      })
      await router.invalidate()
    } catch (error) {
      toast.error(String(error))
      setRows(matches)
    }
  }

  const numbers = new Map(roster.map((t) => [t.teamId, t.number]))
  const label = (teamId: string | null) =>
    teamId ? `${numbers.get(teamId) ?? "?"}` : "—"

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const rounds = Number(new FormData(e.currentTarget).get("rounds"))
              if (!rounds) return
              void runGenerateMore(rounds)
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rounds">Rounds per team</Label>
              <Input
                id="rounds"
                name="rounds"
                type="number"
                min={1}
                max={12}
                defaultValue={3}
                className="w-24"
              />
            </div>
            <Button
              type="submit"
              variant={matches.length > 0 ? "outline" : "default"}
            >
              {matches.length > 0 ? "Generate more" : "Generate schedule"}
            </Button>
          </form>

          <Button variant="outline" onClick={() => setCustomOpen(true)}>
            <PlusIcon />
            Add custom match
          </Button>

          {event.status === "setup" && matches.length > 0 && (
            <Button
              variant="destructive"
              onClick={() => {
                const input = document.getElementById(
                  "rounds"
                ) as HTMLInputElement | null
                setPendingRounds(Number(input?.value) || 3)
              }}
            >
              Regenerate
            </Button>
          )}
        </div>
      )}

      {inPlayoffs && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setPlayoffOpen(true)}>
            <PlusIcon />
            Add playoff match
          </Button>
        </div>
      )}

      {canManage && selectedIds.length > 0 && (
        <div className="flex items-center gap-2 border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">
            {selectedIds.length} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkConfirm(true)}
          >
            <Trash2Icon />
            Delete selected
          </Button>
        </div>
      )}

      <DndContext
        // stable id — the default global counter differs between the SSR pass
        // and the client render, causing a DndDescribedBy hydration mismatch
        id="matches-reorder"
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <Table>
          <TableHeader>
            <TableRow>
              {canManage && <TableHead className="w-8" />}
              {canManage && (
                <TableHead className="w-8">
                  <Checkbox
                    aria-label="Select all matches"
                    checked={
                      allSelected
                        ? true
                        : someSelected
                          ? "indeterminate"
                          : false
                    }
                    disabled={selectable.length === 0}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
              )}
              <TableHead>Match</TableHead>
              {order.map((side) => (
                <TableHead
                  key={side}
                  className="capitalize"
                  style={{ color: `var(--alliance-${side})` }}
                >
                  {side}
                </TableHead>
              ))}
              <TableHead>Score</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            <SortableContext
              items={rows.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
            >
              {rows.map((match, i) => (
                <SortableMatchRow
                  key={match.id}
                  match={match}
                  canManage={canManage}
                  order={order}
                  label={label}
                  selected={selected.has(match.id)}
                  canMoveUp={i > 0 && rows[i - 1].type === match.type}
                  canMoveDown={
                    i < rows.length - 1 && rows[i + 1].type === match.type
                  }
                  onMove={moveMatch}
                  onToggle={toggle}
                  onScore={setScoring}
                  onDelete={setPendingDelete}
                />
              ))}
            </SortableContext>
          </TableBody>
        </Table>
      </DndContext>

      {scoring && (
        <ScoreDialog
          match={scoring}
          gameId={event.gameId}
          label={label}
          order={order}
          onClose={async () => {
            setScoring(null)
            await router.invalidate()
          }}
        />
      )}

      <AlertDialog
        open={pendingRounds !== null}
        onOpenChange={(open) => !open && setPendingRounds(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all {matches.length} existing match
              {matches.length !== 1 ? "es" : ""} and build a new schedule from
              scratch. Any recorded scores will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const rounds = pendingRounds!
                setPendingRounds(null)
                void runRegenerate(rounds)
              }}
            >
              Delete and regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={generating}>
        <DialogContent
          className="max-w-xs text-center"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          showCloseButton={false}
        >
          <DialogHeader className="items-center">
            <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
            <DialogTitle>Generating schedule</DialogTitle>
            <DialogDescription>
              Building a balanced match schedule — this may take a moment.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete ? matchShortLabel(pendingDelete) : "match"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the match and any recorded scores. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const match = pendingDelete!
                setPendingDelete(null)
                try {
                  await deleteFn({
                    data: { eventId: event.id, matchId: match.id },
                  })
                  await router.invalidate()
                } catch (error) {
                  toast.error(String(error))
                }
              }}
            >
              Delete match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkConfirm}
        onOpenChange={(open) => !open && setBulkConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.length} selected match
              {selectedIds.length === 1 ? "" : "es"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the matches and any recorded scores. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runBulkDelete()}>
              Delete {selectedIds.length} match
              {selectedIds.length === 1 ? "" : "es"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomMatchDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        eventId={event.id}
        roster={roster}
        order={order}
        onCreated={async () => {
          setCustomOpen(false)
          await router.invalidate()
        }}
      />

      {inPlayoffs && (
        <AddPlayoffMatchDialog
          open={playoffOpen}
          onOpenChange={setPlayoffOpen}
          eventId={event.id}
          alliances={selection?.alliances ?? []}
          onCreated={async () => {
            setPlayoffOpen(false)
            await router.invalidate()
          }}
        />
      )}
    </div>
  )
}

function SortableMatchRow({
  match,
  canManage,
  order,
  label,
  selected,
  canMoveUp,
  canMoveDown,
  onMove,
  onToggle,
  onScore,
  onDelete,
}: {
  match: MatchRow
  canManage: boolean
  order: readonly [Alliance, Alliance]
  label: (teamId: string | null) => string
  selected: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (match: MatchRow, direction: -1 | 1) => Promise<void>
  onToggle: (id: string) => void
  onScore: (match: MatchRow) => void
  onDelete: (match: MatchRow) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: match.id })

  return (
    <TableRow
      ref={setNodeRef}
      data-state={selected ? "selected" : undefined}
      data-dragging={isDragging}
      className="data-[dragging=true]:opacity-80"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 1 : 0,
      }}
    >
      {canManage && (
        <TableCell className="w-8">
          <button
            type="button"
            className="flex cursor-grab touch-none items-center text-muted-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-4" />
          </button>
        </TableCell>
      )}
      {canManage && (
        <TableCell>
          <Checkbox
            aria-label={`Select ${matchShortLabel(match)}`}
            checked={selected}
            disabled={match.status === "running"}
            onCheckedChange={() => onToggle(match.id)}
          />
        </TableCell>
      )}
      <TableCell>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-medium">{matchShortLabel(match)}</span>
          {match.type === "practice" && (
            <Badge variant="secondary" className="text-[0.65rem]">
              practice
            </Badge>
          )}
          {isExtraPlayoffMatch(match) && (
            <Badge variant="secondary" className="text-[0.65rem]">
              Extra
            </Badge>
          )}
        </span>
      </TableCell>
      {order.map((side) => {
        const base =
          side === "red"
            ? [match.red1, match.red2, match.red3]
            : [match.blue1, match.blue2, match.blue3]
        const backup = side === "red" ? match.red4 : match.blue4
        return (
          <TableCell key={side} className="tabular-nums">
            {/* fixed-width right-aligned slots so team numbers line up */}
            {base.map((id, i) => (
              <span key={i}>
                {i > 0 && <span className="text-muted-foreground"> · </span>}
                <span className="inline-block min-w-[2.5ch] text-right">
                  {label(id)}
                </span>
              </span>
            ))}
            {backup && ` · ${label(backup)} (B)`}
            {side === "red" && match.surrogates.length > 0 && " *"}
          </TableCell>
        )
      })}
      <TableCell className="font-mono">
        {match.redPoints !== null
          ? `${order
              .map((s) => (s === "red" ? match.redPoints : match.bluePoints))
              .join("–")}`
          : "—"}
      </TableCell>
      <TableCell>
        <Badge variant={match.status === "posted" ? "default" : "outline"}>
          {match.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="xs"
                title="Move up"
                disabled={!canMoveUp}
                onClick={() => void onMove(match, -1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                title="Move down"
                disabled={!canMoveDown}
                onClick={() => void onMove(match, 1)}
              >
                <ArrowDownIcon />
              </Button>
            </>
          )}
          <Button variant="outline" size="xs" onClick={() => onScore(match)}>
            Score
          </Button>
          {canManage && (
            <Button
              variant="ghost"
              size="xs"
              title="Delete match"
              disabled={match.status === "running"}
              onClick={() => onDelete(match)}
            >
              <Trash2Icon className="text-destructive" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function CustomMatchDialog({
  open,
  onOpenChange,
  eventId,
  roster,
  onCreated,
  order,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  roster: Awaited<ReturnType<typeof listEventTeams>>
  onCreated: () => void
  order: readonly [Alliance, Alliance]
}) {
  const createFn = useServerFn(createCustomMatch)
  const [matchType, setMatchType] = useState<"qualification" | "practice">(
    "practice"
  )
  const [red, setRed] = useState<(string | null)[]>([null, null, null])
  const [blue, setBlue] = useState<(string | null)[]>([null, null, null])
  const [saving, setSaving] = useState(false)

  const chosen = new Set([...red, ...blue].filter(Boolean) as string[])

  function slot(
    side: "red" | "blue",
    index: number,
    value: string | null,
    set: (next: (string | null)[]) => void,
    current: (string | null)[]
  ) {
    return (
      <Select
        value={value ?? "none"}
        onValueChange={(v) => {
          const next = [...current]
          next[index] = v === "none" ? null : v
          set(next)
        }}
      >
        <SelectTrigger
          className="w-full"
          style={{
            borderColor:
              side === "red" ? "var(--alliance-red)" : "var(--alliance-blue)",
          }}
        >
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— empty —</SelectItem>
          {roster.map((t) => (
            <SelectItem
              key={t.teamId}
              value={t.teamId}
              disabled={chosen.has(t.teamId) && value !== t.teamId}
            >
              {t.number} {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add custom match</DialogTitle>
          <DialogDescription>
            Pick the alliances. Practice matches never count toward rankings or
            team statistics.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label>Match type</Label>
          <Select
            value={matchType}
            onValueChange={(v) =>
              setMatchType(v as "qualification" | "practice")
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="practice">Practice (unranked)</SelectItem>
              <SelectItem value="qualification">Qualification</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {order.map((side) => {
            const value = side === "red" ? red : blue
            const set = side === "red" ? setRed : setBlue
            return (
              <div key={side} className="flex flex-col gap-2">
                <span
                  className="text-xs font-bold tracking-wide capitalize uppercase"
                  style={{ color: `var(--alliance-${side})` }}
                >
                  {side}
                </span>
                {[0, 1, 2].map((i) => (
                  <div key={i}>{slot(side, i, value[i], set, value)}</div>
                ))}
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button
            disabled={saving || chosen.size === 0}
            onClick={async () => {
              setSaving(true)
              try {
                await createFn({
                  data: {
                    eventId,
                    matchType,
                    red: [red[0] ?? null, red[1] ?? null, red[2] ?? null],
                    blue: [blue[0] ?? null, blue[1] ?? null, blue[2] ?? null],
                  },
                })
                setRed([null, null, null])
                setBlue([null, null, null])
                toast.success("Match added")
                onCreated()
              } catch (error) {
                toast.error(String(error))
              } finally {
                setSaving(false)
              }
            }}
          >
            Add match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type SelectionAlliance = NonNullable<
  Awaited<ReturnType<typeof getSelection>>
>["alliances"][number]

function allianceLabel(a: SelectionAlliance) {
  const teams = [a.captain, ...a.picks, a.backup]
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map((t) => t.number)
  return `Alliance ${a.number} — ${teams.join(" · ")}`
}

function AddPlayoffMatchDialog({
  open,
  onOpenChange,
  eventId,
  alliances,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  alliances: SelectionAlliance[]
  onCreated: () => Promise<void>
}) {
  const extraFn = useServerFn(addExtraPlayoffMatch)
  const extendFn = useServerFn(extendFinals)
  const [redNumber, setRedNumber] = useState("")
  const [blueNumber, setBlueNumber] = useState("")
  const [saving, setSaving] = useState(false)

  function allianceSelect(
    side: "red" | "blue",
    value: string,
    set: (v: string) => void
  ) {
    return (
      <div className="flex flex-1 flex-col gap-1.5">
        <Label
          className="capitalize"
          style={{ color: `var(--alliance-${side})` }}
        >
          {side} alliance
        </Label>
        <Select value={value || undefined} onValueChange={set}>
          <SelectTrigger
            className="w-full"
            style={{ borderColor: `var(--alliance-${side})` }}
          >
            <SelectValue placeholder="Pick an alliance" />
          </SelectTrigger>
          <SelectContent>
            {alliances.map((a) => (
              <SelectItem key={a.number} value={String(a.number)}>
                {allianceLabel(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add playoff match</DialogTitle>
          <DialogDescription>
            Extra matches sit outside the bracket; a finals game counts toward
            the championship.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="extra">
          <TabsList className="w-full">
            <TabsTrigger value="extra" className="flex-1">
              Extra match
            </TabsTrigger>
            <TabsTrigger value="extend" className="flex-1">
              Extend finals
            </TabsTrigger>
          </TabsList>

          <TabsContent value="extra" className="flex flex-col gap-4 pt-2">
            <p className="text-sm text-muted-foreground">
              An off-bracket match between any two alliances. It queues, scores,
              and displays like any playoff match but never affects bracket
              advancement or the champion.
            </p>
            <div className="flex gap-3">
              {allianceSelect("red", redNumber, setRedNumber)}
              {allianceSelect("blue", blueNumber, setBlueNumber)}
            </div>
            <DialogFooter>
              <Button
                disabled={
                  saving ||
                  !redNumber ||
                  !blueNumber ||
                  redNumber === blueNumber
                }
                onClick={async () => {
                  setSaving(true)
                  try {
                    await extraFn({
                      data: {
                        eventId,
                        redAllianceNumber: Number(redNumber),
                        blueAllianceNumber: Number(blueNumber),
                      },
                    })
                    toast.success("Extra playoff match added")
                    setRedNumber("")
                    setBlueNumber("")
                    await onCreated()
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : String(error)
                    )
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                Add extra match
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="extend" className="flex flex-col gap-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Appends one more grand-final game between the same two finalists.
              The champion needs a majority of all finals games, so{" "}
              <span className="font-medium text-foreground">
                adding a game to an already-decided series reopens the
                championship
              </span>
              . Available once both finalists are decided.
            </p>
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  try {
                    await extendFn({ data: { eventId } })
                    toast.success("Finals game added")
                    await onCreated()
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : String(error)
                    )
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                Add finals game
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

const PHASE_SECTIONS = [
  { id: "auto", title: "Autonomous" },
  { id: "teleop", title: "Teleop" },
  { id: "endgame", title: "Endgame" },
  { id: "anytime", title: "Any time · penalties" },
] as const

function ScoreDialog({
  match,
  gameId,
  label,
  order,
  onClose,
}: {
  match: MatchRow
  gameId: string
  label: (teamId: string | null) => string
  order: readonly [Alliance, Alliance]
  onClose: () => void
}) {
  const game = getGame(gameId)
  const recordFn = useServerFn(recordScoreEvent)
  const undoFn = useServerFn(undoScoreEvent)
  const postFn = useServerFn(postMatch)
  const resetFn = useServerFn(resetMatch)
  const [log, setLog] = useState<
    Array<{
      id: string
      alliance: string
      type: string
      payload: Record<string, unknown>
    }>
  >([])
  const [points, setPoints] = useState<{
    red: number | null
    blue: number | null
  }>({
    red: match.redPoints,
    blue: match.bluePoints,
  })
  const [manual, setManual] = useState<{ red: string; blue: string }>({
    red: "",
    blue: "",
  })
  const [resetConfirm, setResetConfirm] = useState(false)

  const typeDefs = game.scoreEventTypes as Record<
    string,
    (typeof game.scoreEventTypes)[keyof typeof game.scoreEventTypes] | undefined
  >

  // which section a scoring action belongs to: its (first) phase, or the
  // catch-all when it spans the whole match (fouls etc.)
  function sectionOf(type: string): string {
    const phases = typeDefs[type]?.phases ?? []
    if (phases.length >= 3 || phases.length === 0) return "anytime"
    return phases[0]
  }

  function describeEvent(type: string, payload: Record<string, unknown>) {
    if (type === MANUAL_ADJUST_TYPE) {
      const pts = Number((payload as { points?: number }).points ?? 0)
      return `Manual adjustment ${pts >= 0 ? "+" : ""}${pts}`
    }
    const base = typeDefs[type]?.label ?? type
    if (typeof payload.robotIndex === "number")
      return `${base} · R${payload.robotIndex + 1}`
    if (typeof payload.defenseIndex === "number")
      return `${base} · D${payload.defenseIndex + 1}`
    return base
  }

  async function refresh() {
    const [events, matches] = await Promise.all([
      listScoreEvents({ data: { matchId: match.id } }),
      listMatches({ data: { eventId: match.eventId } }),
    ])
    setLog(
      events
        .filter((e) => !e.undone)
        .map((e) => ({
          id: e.id,
          alliance: e.alliance,
          type: e.type,
          payload: e.payload,
        }))
    )
    const updated = matches.find((m) => m.id === match.id)
    setPoints({
      red: updated?.redPoints ?? null,
      blue: updated?.bluePoints ?? null,
    })
  }

  // load the existing log as soon as the dialog opens
  useEffect(() => {
    void refresh()
  }, [])

  async function record(
    alliance: "red" | "blue",
    type: string,
    payload: Record<string, unknown> = {}
  ) {
    try {
      await recordFn({ data: { matchId: match.id, alliance, type, payload } })
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function setScoreTo(alliance: "red" | "blue") {
    const target = Number(manual[alliance])
    if (!Number.isFinite(target)) return
    const delta = target - (points[alliance] ?? 0)
    setManual((prev) => ({ ...prev, [alliance]: "" }))
    if (delta === 0) return
    await record(alliance, MANUAL_ADJUST_TYPE, { points: delta })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* sm:max-w-5xl: the base DialogContent sets sm:max-w-sm, which a plain
          max-w-* can't override — without the sm: variant the box stays small
          and the wide grid overflows it */}
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            Score {matchShortLabel(match)} —{" "}
            <span className="font-mono">
              {points.red ?? 0}–{points.blue ?? 0}
            </span>
          </DialogTitle>
          <DialogDescription>
            Manual score entry, grouped by when each action happens in a match.
            Totals recompute immediately.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-3">
          {/* wide 3-column layout on desktop (red · blue · log) so the dialog
              stays short; stacks vertically on small/mobile screens */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_16rem]">
            {order.map((alliance) => (
              <div key={alliance} className="flex flex-col gap-3">
                <h3
                  className="text-xs font-medium"
                  style={{ color: `var(--alliance-${alliance})` }}
                >
                  {alliance.toUpperCase()} —{" "}
                  {(alliance === "red"
                    ? [match.red1, match.red2, match.red3]
                    : [match.blue1, match.blue2, match.blue3]
                  )
                    .map(label)
                    .join(" · ")}
                </h3>

                {PHASE_SECTIONS.map((section) => {
                  const entries = Object.entries(game.scoreEventTypes).filter(
                    ([type]) => sectionOf(type) === section.id
                  )
                  if (entries.length === 0) return null
                  return (
                    <div key={section.id} className="flex flex-col gap-1">
                      <h4 className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                        {section.title}
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {entries.map(([type, def]) => {
                          if (def.target === "robot") {
                            return [0, 1, 2].map((robotIndex) => (
                              <Button
                                key={`${type}-${robotIndex}`}
                                variant="outline"
                                size="xs"
                                onClick={() =>
                                  record(alliance, type, { robotIndex })
                                }
                              >
                                {def.label} R{robotIndex + 1}
                              </Button>
                            ))
                          }
                          if (def.target === "defense") {
                            return [0, 1, 2, 3, 4].map((defenseIndex) => (
                              <Button
                                key={`${type}-${defenseIndex}`}
                                variant="outline"
                                size="xs"
                                onClick={() =>
                                  record(alliance, type, { defenseIndex })
                                }
                              >
                                {def.label} D{defenseIndex + 1}
                              </Button>
                            ))
                          }
                          return (
                            <Button
                              key={type}
                              variant="outline"
                              size="xs"
                              onClick={() => record(alliance, type)}
                            >
                              {def.label}
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor={`set-score-${alliance}`}
                      className="text-[0.65rem] tracking-wide text-muted-foreground uppercase"
                    >
                      Set score
                    </Label>
                    <Input
                      id={`set-score-${alliance}`}
                      type="number"
                      className="w-24"
                      placeholder={String(points[alliance] ?? 0)}
                      value={manual[alliance]}
                      onChange={(e) =>
                        setManual((prev) => ({
                          ...prev,
                          [alliance]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void setScoreTo(alliance)
                      }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={manual[alliance].trim() === ""}
                    onClick={() => void setScoreTo(alliance)}
                  >
                    Set
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
              <h3 className="text-xs font-medium">Recorded events</h3>
              <ScrollArea className="h-40 border lg:h-auto lg:min-h-0 lg:flex-1">
                <ul className="flex flex-col text-xs">
                  {log.length === 0 && (
                    <li className="p-2 text-muted-foreground">None yet.</li>
                  )}
                  {/* newest first, undo at the right edge of its own row */}
                  {log
                    .slice()
                    .reverse()
                    .map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-2 border-b border-border/50 px-2 py-1 last:border-b-0"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="text-[0.65rem] font-semibold uppercase"
                            style={{ color: `var(--alliance-${e.alliance})` }}
                          >
                            {e.alliance}
                          </span>
                          {describeEvent(e.type, e.payload)}
                        </span>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={async () => {
                            try {
                              await undoFn({ data: { scoreEventId: e.id } })
                              await refresh()
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : String(error)
                              )
                            }
                          }}
                        >
                          Undo
                        </Button>
                      </li>
                    ))}
                </ul>
              </ScrollArea>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-between">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setResetConfirm(true)}
          >
            <RotateCcwIcon />
            Reset match
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              try {
                await postFn({ data: { matchId: match.id } })
                toast.success("Match posted")
                onClose()
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : String(error)
                )
              }
            }}
          >
            Post match
          </Button>
        </div>

        <AlertDialog open={resetConfirm} onOpenChange={setResetConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Reset {matchShortLabel(match)}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This clears every recorded score event, zeroes both totals, and
                returns the match to scheduled — even if it was posted. This
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  setResetConfirm(false)
                  try {
                    await resetFn({
                      data: { eventId: match.eventId, matchId: match.id },
                    })
                    toast.success("Match reset")
                    await refresh()
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : String(error)
                    )
                  }
                }}
              >
                Reset match
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
