import { and, asc, eq, max } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import type { MatchType } from "@/db/schema"
import { generateQualSchedule } from "@/server/scheduling/matchmaker"
import { matchDeletable } from "@/shared/match-format"
import { getEvent, getEventInStatus, listEventTeams } from "./events"

export function listMatches(db: Db, eventId: string) {
  return db
    .select()
    .from(tables.matches)
    .where(eq(tables.matches.eventId, eventId))
    .orderBy(asc(tables.matches.scheduledOrder))
    .all()
}

export function getMatch(db: Db, matchId: string) {
  const match = db
    .select()
    .from(tables.matches)
    .where(eq(tables.matches.id, matchId))
    .get()
  if (!match) throw new Error("Match not found")
  return match
}

export function regenerateQualSchedule(
  db: Db,
  eventId: string,
  roundsPerTeam: number
) {
  const event = getEventInStatus(db, eventId, ["setup"])
  const roster = listEventTeams(db, eventId)
  const schedule = generateQualSchedule(
    roster.map((t) => t.teamId),
    { roundsPerTeam }
  )

  return db.transaction((tx) => {
    tx.delete(tables.matches)
      .where(
        and(
          eq(tables.matches.eventId, eventId),
          eq(tables.matches.type, "qualification")
        )
      )
      .run()
    tx.update(tables.events)
      .set({
        settings: { ...event.settings, qualRoundsPerTeam: roundsPerTeam },
      })
      .where(eq(tables.events.id, eventId))
      .run()
    return schedule.map((m) =>
      tx
        .insert(tables.matches)
        .values({
          eventId,
          type: "qualification",
          number: m.number,
          scheduledOrder: m.number,
          red1: m.red[0],
          red2: m.red[1],
          red3: m.red[2],
          blue1: m.blue[0],
          blue2: m.blue[1],
          blue3: m.blue[2],
          surrogates: m.surrogates,
        })
        .returning()
        .get()
    )
  })
}

/** highest existing `number` for a match type in an event (0 if none) */
function maxNumber(db: Db, eventId: string, type: MatchType): number {
  const row = db
    .select({ value: max(tables.matches.number) })
    .from(tables.matches)
    .where(
      and(eq(tables.matches.eventId, eventId), eq(tables.matches.type, type))
    )
    .get()
  return row?.value ?? 0
}

function maxOrder(db: Db, eventId: string): number {
  const row = db
    .select({ value: max(tables.matches.scheduledOrder) })
    .from(tables.matches)
    .where(eq(tables.matches.eventId, eventId))
    .get()
  return row?.value ?? 0
}

/** Appends more qualification rounds without disturbing existing matches. */
export function generateMoreQualMatches(
  db: Db,
  eventId: string,
  additionalRounds: number
) {
  getEventInStatus(db, eventId, ["setup", "quals"])
  const roster = listEventTeams(db, eventId)
  const schedule = generateQualSchedule(
    roster.map((t) => t.teamId),
    { roundsPerTeam: additionalRounds }
  )

  return db.transaction((tx) => {
    let number = maxNumber(tx, eventId, "qualification")
    let order = maxOrder(tx, eventId)
    return schedule.map((m) => {
      number += 1
      order += 1
      return tx
        .insert(tables.matches)
        .values({
          eventId,
          type: "qualification",
          number,
          scheduledOrder: order,
          red1: m.red[0],
          red2: m.red[1],
          red3: m.red[2],
          blue1: m.blue[0],
          blue2: m.blue[1],
          blue3: m.blue[2],
          surrogates: m.surrogates,
        })
        .returning()
        .get()
    })
  })
}

/** Creates a single match with hand-picked alliances (qualification or practice). */
export function createCustomMatch(
  db: Db,
  eventId: string,
  input: {
    matchType: "qualification" | "practice"
    red: (string | null)[]
    blue: (string | null)[]
  }
) {
  const allowed: Parameters<typeof getEventInStatus>[2] =
    input.matchType === "practice"
      ? ["setup", "quals", "alliance_selection", "playoffs"]
      : ["setup", "quals"]
  getEventInStatus(db, eventId, allowed)

  const slots = [...input.red.slice(0, 3), ...input.blue.slice(0, 3)]
  const present = slots.filter((id): id is string => id !== null)
  if (present.length === 0)
    throw new Error("Add at least one team to the match")
  if (new Set(present).size !== present.length)
    throw new Error("A team can only appear once in a match")

  return db.transaction((tx) =>
    tx
      .insert(tables.matches)
      .values({
        eventId,
        type: input.matchType,
        number: maxNumber(tx, eventId, input.matchType) + 1,
        scheduledOrder: maxOrder(tx, eventId) + 1,
        red1: input.red[0] ?? null,
        red2: input.red[1] ?? null,
        red3: input.red[2] ?? null,
        blue1: input.blue[0] ?? null,
        blue2: input.blue[1] ?? null,
        blue3: input.blue[2] ?? null,
      })
      .returning()
      .get()
  )
}

/** Hard failures that abort a delete (and roll back a whole batch). */
function assertDeleteAllowed(
  match: typeof tables.matches.$inferSelect,
  eventId: string
): void {
  if (match.eventId !== eventId)
    throw new Error("Match belongs to a different event")
  if (match.status === "running")
    throw new Error("Cannot delete a running match")
}

/**
 * Reason a match is skipped rather than deleted, or null if deletable.
 * Deletable: practice, unposted quals, and off-bracket "extra" playoff
 * matches (see `matchDeletable`).
 */
function deleteSkipReason(
  match: typeof tables.matches.$inferSelect
): string | null {
  if (!matchDeletable(match)) {
    if (match.type === "qualification")
      return "Cannot delete a posted qualification match — reset it first"
    return "Bracket playoff matches can't be deleted — regenerate the bracket instead"
  }
  return null
}

function deleteMatchRow(tx: Db, eventId: string, matchId: string) {
  // if the match was queued on the field, clear the pointer so it never dangles
  if (getEvent(tx, eventId).currentMatchId === matchId) {
    tx.update(tables.events)
      .set({ currentMatchId: null })
      .where(eq(tables.events.id, eventId))
      .run()
  }
  // cards linked to this match (red-card score zeroing) would dangle; drop them
  tx.delete(tables.cards).where(eq(tables.cards.matchId, matchId)).run()
  // score_events cascade on match delete (FK), so just remove the row
  tx.delete(tables.matches).where(eq(tables.matches.id, matchId)).run()
}

/** Deletes a match (and its score events, which cascade). */
export function deleteMatch(db: Db, eventId: string, matchId: string) {
  const match = getMatch(db, matchId)
  assertDeleteAllowed(match, eventId)
  const reason = deleteSkipReason(match)
  if (reason) throw new Error(reason)
  return db.transaction((tx) => deleteMatchRow(tx, eventId, matchId))
}

/**
 * Delete several matches in one transaction. A running (or foreign) match
 * rejects the whole batch; ineligible-but-harmless picks (posted quals,
 * bracket playoff matches) are skipped and counted so the caller can
 * summarize.
 */
export function deleteMatches(db: Db, eventId: string, matchIds: string[]) {
  const ids = [...new Set(matchIds)]
  if (ids.length === 0) return { deleted: 0, skipped: 0 }

  return db.transaction((tx) => {
    let deleted = 0
    let skipped = 0
    for (const matchId of ids) {
      const match = getMatch(tx, matchId)
      assertDeleteAllowed(match, eventId) // throws → whole batch rolls back
      if (deleteSkipReason(match)) {
        skipped++
        continue
      }
      deleteMatchRow(tx, eventId, matchId)
      deleted++
    }
    return { deleted, skipped }
  })
}

/**
 * Persist a new play order. `orderedIds` must be a permutation of every match
 * in the event; each match's `scheduledOrder` is rewritten to its new position
 * (1-based). Match numbers/labels are left untouched — this only changes the
 * sequence matches play in, not their identity.
 */
export function reorderMatches(db: Db, eventId: string, orderedIds: string[]) {
  const existing = db
    .select({ id: tables.matches.id })
    .from(tables.matches)
    .where(eq(tables.matches.eventId, eventId))
    .all()

  if (
    orderedIds.length !== existing.length ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    throw new Error("Reorder must list every match in the event exactly once")
  }
  const existingIds = new Set(existing.map((m) => m.id))
  for (const id of orderedIds) {
    if (!existingIds.has(id))
      throw new Error("Match belongs to a different event")
  }

  return db.transaction((tx) => {
    orderedIds.forEach((id, i) => {
      tx.update(tables.matches)
        .set({ scheduledOrder: i + 1 })
        .where(eq(tables.matches.id, id))
        .run()
    })
  })
}
