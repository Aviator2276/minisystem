import { count, desc, eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import type { CachedAllianceScore } from "./scoring"

export interface AdminDashboard {
  teamCount: number
  eventCount: number
  postedMatchCount: number
  scoreEventCount: number
  events: Array<{
    id: string
    name: string
    status: string
    teamCount: number
    matchCount: number
  }>
  recentMatches: Array<{
    label: string
    eventName: string
    red: number
    blue: number
    winner: string | null
  }>
}

export function getAdminDashboard(db: Db): AdminDashboard {
  const [{ value: teamCount }] = db
    .select({ value: count() })
    .from(tables.teams)
    .all()
  const [{ value: scoreEventCount }] = db
    .select({ value: count() })
    .from(tables.scoreEvents)
    .all()

  const events = db
    .select()
    .from(tables.events)
    .orderBy(desc(tables.events.createdAt))
    .all()
    .map((event) => {
      const [{ value: eventTeamCount }] = db
        .select({ value: count() })
        .from(tables.eventTeams)
        .where(eq(tables.eventTeams.eventId, event.id))
        .all()
      const [{ value: matchCount }] = db
        .select({ value: count() })
        .from(tables.matches)
        .where(eq(tables.matches.eventId, event.id))
        .all()
      return {
        id: event.id,
        name: event.name,
        status: event.status,
        teamCount: eventTeamCount,
        matchCount,
      }
    })

  const eventNames = new Map(events.map((e) => [e.id, e.name]))
  const [{ value: postedMatchCount }] = db
    .select({ value: count() })
    .from(tables.matches)
    .where(eq(tables.matches.status, "posted"))
    .all()
  const posted = db
    .select()
    .from(tables.matches)
    .where(eq(tables.matches.status, "posted"))
    .orderBy(desc(tables.matches.scheduledOrder))
    .limit(20)
    .all()

  const recentMatches = posted
    .map((match) => ({
      label: `${match.type === "qualification" ? "Q" : "P"}${match.number}`,
      eventName: eventNames.get(match.eventId) ?? "",
      red:
        (match.redScore as CachedAllianceScore | null)?.totals.total ??
        match.redPoints ??
        0,
      blue:
        (match.blueScore as CachedAllianceScore | null)?.totals.total ??
        match.bluePoints ??
        0,
      winner: match.winner,
    }))
    .reverse()

  return {
    teamCount,
    eventCount: events.length,
    postedMatchCount,
    scoreEventCount,
    events,
    recentMatches,
  }
}
