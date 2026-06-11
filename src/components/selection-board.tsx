import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  EnrichedSelectionState,
  SelectionTeam,
} from "@/server/services/selection"

/** presentational alliance-selection board shared by the control panel and display */
export function SelectionBoard({
  state,
  dark = false,
}: {
  state: EnrichedSelectionState
  dark?: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      {state.pendingInvite && (
        <div
          className={cn(
            "border-2 border-dashed p-3 text-center text-lg",
            dark
              ? "border-yellow-300 text-yellow-300"
              : "border-yellow-600 text-yellow-700"
          )}
        >
          Alliance {state.pendingInvite.allianceNumber} invites{" "}
          <span className="font-bold">
            {state.pendingInvite.team.number} {state.pendingInvite.team.name}
          </span>
        </div>
      )}
      <div className="grid gap-3 @md/board:grid-cols-2 @2xl/board:grid-cols-3">
        {state.alliances.map((alliance) => {
          const onClock = state.currentAllianceNumber === alliance.number
          return (
            <div
              key={alliance.number}
              className={cn(
                "border p-3",
                dark ? "border-white/20 bg-white/5" : "bg-card",
                onClock && "ring-2 ring-primary"
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold">
                  Alliance {alliance.number}
                </span>
                {onClock && <Badge>picking</Badge>}
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <TeamLine team={alliance.captain} role="C" dark={dark} />
                <TeamLine
                  team={alliance.picks[0] ?? null}
                  role="1"
                  dark={dark}
                />
                <TeamLine
                  team={alliance.picks[1] ?? null}
                  role="2"
                  dark={dark}
                />
              </div>
            </div>
          )
        })}
      </div>
      {state.complete && state.backups.length > 0 && (
        <div
          className={cn(
            "text-sm",
            dark ? "text-white/70" : "text-muted-foreground"
          )}
        >
          Backup bots:{" "}
          {state.backups.map((t) => `${t.number} ${t.name}`).join(" · ")}
        </div>
      )}
      {state.declined.length > 0 && (
        <div
          className={cn(
            "text-xs",
            dark ? "text-white/50" : "text-muted-foreground"
          )}
        >
          Declined: {state.declined.map((t) => `${t.number}`).join(", ")}
        </div>
      )}
    </div>
  )
}

function TeamLine({
  team,
  role,
  dark,
}: {
  team: SelectionTeam | null
  role: string
  dark: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "w-5 text-center text-[0.65rem] font-bold",
          dark ? "bg-white/20" : "bg-muted"
        )}
      >
        {role}
      </span>
      {team ? (
        <span>
          <span className="font-mono font-bold">{team.number}</span> {team.name}
        </span>
      ) : (
        <span className={dark ? "text-white/40" : "text-muted-foreground"}>
          —
        </span>
      )}
    </div>
  )
}
