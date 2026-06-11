import { AnimatePresence, motion } from "motion/react"
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
  showInviteBanner = true,
  showAvailable = false,
  animated = false,
}: {
  state: EnrichedSelectionState
  dark?: boolean
  /** the "Alliance N invites X" banner — hidden on the control panel where the
   * card header and accept/decline buttons already convey the pending invite */
  showInviteBanner?: boolean
  /** read-only bank of still-available teams in rank order (display screen) */
  showAvailable?: boolean
  /** enable layout/enter/exit motion (display screen) */
  animated?: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      {showInviteBanner && (
        <AnimatePresence initial={false}>
          {state.pendingInvite && (
            <motion.div
              key={`${state.pendingInvite.allianceNumber}-${state.pendingInvite.team.teamId}`}
              layout={animated}
              initial={animated ? { opacity: 0, y: -12, scale: 0.97 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={animated ? { opacity: 0, y: -12, scale: 0.97 } : undefined}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className={cn(
                "border-2 border-dashed p-3 text-center text-lg",
                dark
                  ? "border-yellow-300 text-yellow-300"
                  : "border-yellow-600 text-yellow-700"
              )}
            >
              Alliance {state.pendingInvite.allianceNumber} invites{" "}
              <span className="font-bold">
                {state.pendingInvite.team.number}{" "}
                {state.pendingInvite.team.name}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <div
        className={cn(
          showAvailable && "@2xl/board:grid @2xl/board:grid-cols-[1fr_18rem]",
          showAvailable && "gap-4"
        )}
      >
        <motion.div
          layout={animated}
          className="grid gap-3 @md/board:grid-cols-2 @2xl/board:grid-cols-3"
        >
          {state.alliances.map((alliance) => {
            const onClock = state.currentAllianceNumber === alliance.number
            return (
              <motion.div
                key={alliance.number}
                layout={animated}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className={cn(
                  "border p-3 transition-shadow",
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
                  <TeamLine
                    team={alliance.captain}
                    role="C"
                    dark={dark}
                    animated={animated}
                  />
                  <TeamLine
                    team={alliance.picks[0] ?? null}
                    role="1"
                    dark={dark}
                    animated={animated}
                  />
                  <TeamLine
                    team={alliance.picks[1] ?? null}
                    role="2"
                    dark={dark}
                    animated={animated}
                  />
                </div>
              </motion.div>
            )
          })}
        </motion.div>

        {showAvailable && !state.complete && (
          <AvailableBank
            teams={state.available}
            dark={dark}
            animated={animated}
          />
        )}
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

/** read-only bank of available teams, already sorted in rank order */
function AvailableBank({
  teams,
  dark,
  animated,
}: {
  teams: SelectionTeam[]
  dark: boolean
  animated: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className={cn(
          "text-xs font-semibold tracking-wide uppercase",
          dark ? "text-white/60" : "text-muted-foreground"
        )}
      >
        Available · rank order
      </span>
      {teams.length === 0 ? (
        <span
          className={cn(
            "text-sm",
            dark ? "text-white/40" : "text-muted-foreground"
          )}
        >
          No teams remaining
        </span>
      ) : (
        <ol className="flex flex-col gap-1">
          <AnimatePresence initial={false}>
            {teams.map((team, index) => (
              <motion.li
                key={team.teamId}
                layout={animated}
                initial={animated ? { opacity: 0, x: -16 } : false}
                animate={{ opacity: 1, x: 0 }}
                exit={
                  animated
                    ? { opacity: 0, x: 16, transition: { duration: 0.18 } }
                    : undefined
                }
                transition={{ type: "spring", stiffness: 360, damping: 30 }}
                className={cn(
                  "flex items-center gap-2 border px-2 py-1 text-sm",
                  dark ? "border-white/15 bg-white/5" : "bg-card"
                )}
              >
                <span
                  className={cn(
                    "w-5 text-center text-[0.65rem] font-bold tabular-nums",
                    dark ? "text-white/50" : "text-muted-foreground"
                  )}
                >
                  {index + 1}
                </span>
                <span className="font-mono font-bold">{team.number}</span>
                <span className="truncate">{team.name}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  )
}

function TeamLine({
  team,
  role,
  dark,
  animated,
}: {
  team: SelectionTeam | null
  role: string
  dark: boolean
  animated: boolean
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
      <AnimatePresence mode="wait" initial={false}>
        {team ? (
          <motion.span
            key={team.teamId}
            initial={animated ? { opacity: 0, x: -8 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
          >
            <span className="font-mono font-bold">{team.number}</span>{" "}
            {team.name}
          </motion.span>
        ) : (
          <span className={dark ? "text-white/40" : "text-muted-foreground"}>
            —
          </span>
        )}
      </AnimatePresence>
    </div>
  )
}
