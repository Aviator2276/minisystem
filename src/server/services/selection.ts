import { asc, eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import type { SelectionStatus } from "@/db/schema"
import { publish } from "@/server/realtime/publish"
import {
  allianceCountFor,
  reduceSelection,
} from "@/server/selection/state-machine"
import type {
  SelectionActionInput,
  SelectionState,
} from "@/server/selection/state-machine"
import { getEvent } from "./events"
import { computeRankings } from "./rankings"

export interface SelectionTeam {
  teamId: string
  number: number
  name: string
}

/** SelectionState with team ids resolved for direct rendering */
export interface EnrichedSelectionState {
  allianceCount: number
  alliances: Array<{
    number: number
    captain: SelectionTeam | null
    picks: SelectionTeam[]
  }>
  declined: SelectionTeam[]
  pendingInvite: { allianceNumber: number; team: SelectionTeam } | null
  currentAllianceNumber: number | null
  pickRound: 1 | 2 | null
  backups: SelectionTeam[]
  complete: boolean
  available: SelectionTeam[]
}

function loadActions(db: Db, eventId: string): SelectionActionInput[] {
  return db
    .select()
    .from(tables.selectionActions)
    .where(eq(tables.selectionActions.eventId, eventId))
    .orderBy(
      asc(tables.selectionActions.createdAt),
      asc(tables.selectionActions.id)
    )
    .all()
    .map((row) => {
      if (row.type === "invite") {
        return { type: "invite", teamId: String(row.payload.teamId) }
      }
      return { type: row.type }
    })
}

function rankedTeams(db: Db, eventId: string): SelectionTeam[] {
  return computeRankings(db, eventId).map((row) => ({
    teamId: row.teamId,
    number: row.number,
    name: row.name,
  }))
}

function enrich(
  state: SelectionState,
  teams: SelectionTeam[]
): EnrichedSelectionState {
  const byId = new Map(teams.map((t) => [t.teamId, t]))
  const resolve = (teamId: string): SelectionTeam =>
    byId.get(teamId) ?? { teamId, number: 0, name: "?" }
  return {
    allianceCount: state.allianceCount,
    alliances: state.alliances.map((a) => ({
      number: a.number,
      captain: a.captainTeamId ? resolve(a.captainTeamId) : null,
      picks: a.pickTeamIds.map(resolve),
    })),
    declined: state.declined.map(resolve),
    pendingInvite: state.pendingInvite
      ? {
          allianceNumber: state.pendingInvite.allianceNumber,
          team: resolve(state.pendingInvite.teamId),
        }
      : null,
    currentAllianceNumber: state.currentAllianceNumber,
    pickRound: state.pickRound,
    backups: state.backups.map(resolve),
    complete: state.complete,
    available: state.available.map(resolve),
  }
}

export function getSelectionState(
  db: Db,
  eventId: string
): EnrichedSelectionState {
  const teams = rankedTeams(db, eventId)

  // Once selection is locked in, the result lives in `alliances` +
  // `event_teams.selectionStatus`. Re-deriving it by replaying the action log
  // against live rankings is fragile: a later qual-score edit (score/DQ/
  // surrogate) shifts the rank order, so a recorded invite can land on a
  // now-locked captain and the replay throws. Read the materialized truth.
  const event = getEvent(db, eventId)
  if (event.status === "playoffs" || event.status === "complete") {
    return materializedSelectionState(db, eventId, teams)
  }

  const state = reduceSelection(
    teams.map((t) => t.teamId),
    loadActions(db, eventId),
    allianceCountFor(teams.length)
  )
  return enrich(state, teams)
}

/** Builds the finalized selection view from persisted rows (no replay). */
function materializedSelectionState(
  db: Db,
  eventId: string,
  teams: SelectionTeam[]
): EnrichedSelectionState {
  const byId = new Map(teams.map((t) => [t.teamId, t]))
  const resolve = (teamId: string): SelectionTeam =>
    byId.get(teamId) ?? { teamId, number: 0, name: "?" }

  const allianceRows = db
    .select()
    .from(tables.alliances)
    .where(eq(tables.alliances.eventId, eventId))
    .orderBy(asc(tables.alliances.number))
    .all()

  const statusByTeam = new Map(
    db
      .select()
      .from(tables.eventTeams)
      .where(eq(tables.eventTeams.eventId, eventId))
      .all()
      .map((row) => [row.teamId, row.selectionStatus])
  )
  // keep declined/backup/available in rank order for stable display
  const withStatus = (status: SelectionStatus): SelectionTeam[] =>
    teams.filter((t) => statusByTeam.get(t.teamId) === status)

  return {
    allianceCount: allianceRows.length,
    alliances: allianceRows.map((a) => ({
      number: a.number,
      captain: a.captainTeamId ? resolve(a.captainTeamId) : null,
      picks: [a.pick1TeamId, a.pick2TeamId]
        .filter((id): id is string => id !== null)
        .map(resolve),
    })),
    declined: withStatus("declined"),
    pendingInvite: null,
    currentAllianceNumber: null,
    pickRound: null,
    backups: withStatus("backup"),
    complete: true,
    available: withStatus("available"),
  }
}

export function applySelectionAction(
  db: Db,
  eventId: string,
  action: SelectionActionInput,
  userId: string
): EnrichedSelectionState {
  const event = getEvent(db, eventId)
  if (event.status !== "alliance_selection") {
    throw new Error("Event is not in alliance selection")
  }
  const teams = rankedTeams(db, eventId)
  const teamIds = teams.map((t) => t.teamId)
  const actions = loadActions(db, eventId)

  // trial reduction validates the action before anything is written
  const state = reduceSelection(
    teamIds,
    [...actions, action],
    allianceCountFor(teams.length)
  )

  db.insert(tables.selectionActions)
    .values({
      eventId,
      type: action.type,
      payload: action.type === "invite" ? { teamId: action.teamId } : {},
      createdBy: userId,
    })
    .run()

  materialize(db, eventId, state)
  const enriched = enrich(state, teams)
  publish(eventId, "all", { type: "selection_update", payload: enriched })
  return enriched
}

/** mirrors the reduced state into alliances + event_teams.selectionStatus */
function materialize(
  db: Db,
  eventId: string,
  state: ReturnType<typeof reduceSelection>
): void {
  db.transaction((tx) => {
    tx.delete(tables.alliances)
      .where(eq(tables.alliances.eventId, eventId))
      .run()
    for (const alliance of state.alliances) {
      tx.insert(tables.alliances)
        .values({
          eventId,
          number: alliance.number,
          captainTeamId: alliance.captainTeamId,
          pick1TeamId: alliance.pickTeamIds[0] ?? null,
          pick2TeamId: alliance.pickTeamIds[1] ?? null,
        })
        .run()
    }

    const statusOf = (teamId: string) => {
      if (state.alliances.some((a) => a.captainTeamId === teamId))
        return "captain" as const
      if (state.alliances.some((a) => a.pickTeamIds.includes(teamId)))
        return "picked" as const
      if (state.declined.includes(teamId)) return "declined" as const
      if (state.backups.includes(teamId)) return "backup" as const
      return "available" as const
    }
    const roster = tx
      .select()
      .from(tables.eventTeams)
      .where(eq(tables.eventTeams.eventId, eventId))
      .all()
    for (const row of roster) {
      tx.update(tables.eventTeams)
        .set({ selectionStatus: statusOf(row.teamId) })
        .where(eq(tables.eventTeams.id, row.id))
        .run()
    }
  })
}
