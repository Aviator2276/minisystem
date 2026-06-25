import { and, asc, eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import type { EventStatus } from "@/db/schema"

const STATUS_ORDER: EventStatus[] = [
  "setup",
  "quals",
  "alliance_selection",
  "playoffs",
  "complete",
]

export function listEvents(db: Db) {
  return db
    .select()
    .from(tables.events)
    .orderBy(asc(tables.events.createdAt))
    .all()
}

export function getEvent(db: Db, eventId: string) {
  const event = db
    .select()
    .from(tables.events)
    .where(eq(tables.events.id, eventId))
    .get()
  if (!event) throw new Error("Event not found")
  return event
}

export function getEventBySlug(db: Db, slug: string) {
  const event = db
    .select()
    .from(tables.events)
    .where(eq(tables.events.slug, slug))
    .get()
  if (!event) throw new Error("Event not found")
  return event
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** a slug that isn't yet taken, suffixing -2, -3, … on collision */
function uniqueSlug(db: Db, base: string): string {
  const root = base || "event"
  let slug = root
  let n = 2
  while (
    db.select().from(tables.events).where(eq(tables.events.slug, slug)).get()
  ) {
    slug = `${root}-${n++}`
  }
  return slug
}

export function createEvent(db: Db, input: { name: string; slug?: string }) {
  return db
    .insert(tables.events)
    .values({ name: input.name, slug: input.slug || slugify(input.name) })
    .returning()
    .get()
}

/**
 * Create a new event from an existing one: copies the name (renamed by the
 * caller), game, and settings, plus the team roster. None of the generated
 * data (matches, scores, alliances, selection, cards) is carried over — the
 * copy starts fresh in `setup`.
 */
export function duplicateEvent(db: Db, sourceEventId: string, name: string) {
  const source = getEvent(db, sourceEventId)
  return db.transaction((tx) => {
    const event = tx
      .insert(tables.events)
      .values({
        name,
        slug: uniqueSlug(tx, slugify(name)),
        gameId: source.gameId,
        settings: source.settings,
      })
      .returning()
      .get()

    const roster = tx
      .select({ teamId: tables.eventTeams.teamId })
      .from(tables.eventTeams)
      .where(eq(tables.eventTeams.eventId, sourceEventId))
      .all()
    if (roster.length > 0) {
      tx.insert(tables.eventTeams)
        .values(roster.map((r) => ({ eventId: event.id, teamId: r.teamId })))
        .run()
    }
    return event
  })
}

export function deleteEvent(db: Db, eventId: string) {
  db.delete(tables.events).where(eq(tables.events.id, eventId)).run()
}

export function listEventTeams(db: Db, eventId: string) {
  return db
    .select({
      id: tables.eventTeams.id,
      teamId: tables.teams.id,
      number: tables.teams.number,
      name: tables.teams.name,
      selectionStatus: tables.eventTeams.selectionStatus,
      rankingPoints: tables.eventTeams.rankingPoints,
    })
    .from(tables.eventTeams)
    .innerJoin(tables.teams, eq(tables.eventTeams.teamId, tables.teams.id))
    .where(eq(tables.eventTeams.eventId, eventId))
    .orderBy(asc(tables.teams.number))
    .all()
}

/**
 * Nudge a team's manual ranking-points adjustment by `delta` (admin +1/-1).
 * Signed (may go negative) so an admin can dock points below what a team has
 * earned from matches. Returns the new adjustment value.
 */
export function adjustRankingPoints(
  db: Db,
  eventId: string,
  teamId: string,
  delta: number
) {
  const row = db
    .select({ rankingPoints: tables.eventTeams.rankingPoints })
    .from(tables.eventTeams)
    .where(
      and(
        eq(tables.eventTeams.eventId, eventId),
        eq(tables.eventTeams.teamId, teamId)
      )
    )
    .get()
  if (!row) throw new Error("Team is not on this event roster")
  const next = row.rankingPoints + delta
  db.update(tables.eventTeams)
    .set({ rankingPoints: next })
    .where(
      and(
        eq(tables.eventTeams.eventId, eventId),
        eq(tables.eventTeams.teamId, teamId)
      )
    )
    .run()
  return next
}

export function attachTeams(db: Db, eventId: string, teamIds: string[]) {
  const existing = new Set(
    db
      .select({ teamId: tables.eventTeams.teamId })
      .from(tables.eventTeams)
      .where(eq(tables.eventTeams.eventId, eventId))
      .all()
      .map((r) => r.teamId)
  )
  const fresh = teamIds.filter((id) => !existing.has(id))
  if (fresh.length > 0) {
    db.insert(tables.eventTeams)
      .values(fresh.map((teamId) => ({ eventId, teamId })))
      .run()
  }
  return fresh.length
}

export function detachTeam(db: Db, eventId: string, teamId: string) {
  getEventInStatus(db, eventId, ["setup"])
  db.delete(tables.eventTeams)
    .where(
      and(
        eq(tables.eventTeams.eventId, eventId),
        eq(tables.eventTeams.teamId, teamId)
      )
    )
    .run()
}

export function importRoster(
  db: Db,
  targetEventId: string,
  sourceEventId: string
) {
  const source = listEventTeams(db, sourceEventId)
  return attachTeams(
    db,
    targetEventId,
    source.map((t) => t.teamId)
  )
}

export function advanceStatus(db: Db, eventId: string, to: EventStatus) {
  const event = getEvent(db, eventId)
  const from = STATUS_ORDER.indexOf(event.status)
  const target = STATUS_ORDER.indexOf(to)
  if (target !== from + 1) {
    throw new Error(`Cannot move event from '${event.status}' to '${to}'`)
  }
  return db
    .update(tables.events)
    .set({ status: to })
    .where(eq(tables.events.id, eventId))
    .returning()
    .get()
}

export function setFlipAllianceSides(db: Db, eventId: string, flip: boolean) {
  const event = getEvent(db, eventId)
  return db
    .update(tables.events)
    .set({ settings: { ...event.settings, flipAllianceSides: flip } })
    .where(eq(tables.events.id, eventId))
    .returning()
    .get()
}

export function setFinalsBestOf3(db: Db, eventId: string, value: boolean) {
  const event = getEvent(db, eventId)
  return db
    .update(tables.events)
    .set({ settings: { ...event.settings, finalsBestOf3: value } })
    .where(eq(tables.events.id, eventId))
    .returning()
    .get()
}

export function getEventInStatus(
  db: Db,
  eventId: string,
  allowed: EventStatus[]
) {
  const event = getEvent(db, eventId)
  if (!allowed.includes(event.status)) {
    throw new Error(
      `Event must be in status ${allowed.join("|")}, is '${event.status}'`
    )
  }
  return event
}
