import { and, asc, eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import { generateQualSchedule } from "@/server/scheduling/matchmaker"
import { getEventInStatus, listEventTeams } from "./events"

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
