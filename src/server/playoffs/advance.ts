import { and, asc, desc, eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import { getEventInStatus } from "@/server/services/events"
import { bracketTemplate } from "./templates"

type MatchRow = typeof tables.matches.$inferSelect
type AllianceRow = typeof tables.alliances.$inferSelect

/**
 * Creates the playoff match rows for an event from its bracket template.
 * Seed sources resolve immediately; winner/loser sources resolve as their
 * feeder matches post. Regeneration is allowed until a playoff match posts.
 */
export function generateBracket(db: Db, eventId: string) {
  getEventInStatus(db, eventId, ["playoffs"])
  const alliances = db
    .select()
    .from(tables.alliances)
    .where(eq(tables.alliances.eventId, eventId))
    .orderBy(asc(tables.alliances.number))
    .all()
  if (alliances.length < 2) throw new Error("Run alliance selection first")

  const existing = playoffMatches(db, eventId)
  if (existing.some((m) => m.status === "posted")) {
    throw new Error(
      "Bracket already has posted results — it can no longer be regenerated"
    )
  }

  const template = bracketTemplate(alliances.length)
  const maxOrder = db
    .select({ value: tables.matches.scheduledOrder })
    .from(tables.matches)
    .where(eq(tables.matches.eventId, eventId))
    .orderBy(desc(tables.matches.scheduledOrder))
    .limit(1)
    .get()

  return db.transaction((tx) => {
    tx.delete(tables.matches)
      .where(
        and(
          eq(tables.matches.eventId, eventId),
          eq(tables.matches.type, "playoff")
        )
      )
      .run()
    template.forEach((m, i) => {
      tx.insert(tables.matches)
        .values({
          eventId,
          type: "playoff",
          number: i + 1,
          bracketSlot: m.slot,
          redSource: m.red,
          blueSource: m.blue,
          scheduledOrder: (maxOrder?.value ?? 0) + i + 1,
        })
        .run()
    })
    resolveBracket(tx, eventId)
    return playoffMatches(tx, eventId)
  })
}

export function playoffMatches(db: Db, eventId: string): MatchRow[] {
  return db
    .select()
    .from(tables.matches)
    .where(
      and(
        eq(tables.matches.eventId, eventId),
        eq(tables.matches.type, "playoff")
      )
    )
    .orderBy(asc(tables.matches.scheduledOrder))
    .all()
}

/**
 * Fills alliance + team columns for every playoff match whose sources are
 * decided. Idempotent — call after generating and after every posted result.
 */
export function resolveBracket(db: Db, eventId: string): void {
  const alliances = db
    .select()
    .from(tables.alliances)
    .where(eq(tables.alliances.eventId, eventId))
    .all()
  const bySeed = new Map(alliances.map((a) => [a.number, a]))
  const matches = playoffMatches(db, eventId)
  const bySlot = new Map(matches.map((m) => [m.bracketSlot ?? "", m]))

  function resolveSource(source: string | null): AllianceRow | null {
    if (!source) return null
    const [kind, key] = source.split(":")
    if (kind === "seed") return bySeed.get(Number(key)) ?? null
    const feeder = bySlot.get(key)
    if (
      !feeder ||
      feeder.status !== "posted" ||
      !feeder.winner ||
      feeder.winner === "tie"
    ) {
      return null
    }
    const winnerId =
      feeder.winner === "red" ? feeder.redAllianceId : feeder.blueAllianceId
    const loserId =
      feeder.winner === "red" ? feeder.blueAllianceId : feeder.redAllianceId
    const id = kind === "winner" ? winnerId : loserId
    return alliances.find((a) => a.id === id) ?? null
  }

  for (const match of matches) {
    if (match.status === "posted") continue
    const red = resolveSource(match.redSource)
    const blue = resolveSource(match.blueSource)
    const update: Partial<typeof tables.matches.$inferInsert> = {}
    if (red && match.redAllianceId !== red.id) {
      update.redAllianceId = red.id
      update.red1 = red.captainTeamId
      update.red2 = red.pick1TeamId
      update.red3 = red.pick2TeamId
    }
    if (blue && match.blueAllianceId !== blue.id) {
      update.blueAllianceId = blue.id
      update.blue1 = blue.captainTeamId
      update.blue2 = blue.pick1TeamId
      update.blue3 = blue.pick2TeamId
    }
    if (Object.keys(update).length > 0) {
      db.update(tables.matches)
        .set(update)
        .where(eq(tables.matches.id, match.id))
        .run()
    }
  }
}

export interface BracketView {
  allianceCount: number
  champion: { allianceId: string; number: number } | null
  matches: Array<
    MatchRow & {
      redAllianceNumber: number | null
      blueAllianceNumber: number | null
      bracket: string
      round: number
    }
  >
}

export function getBracket(db: Db, eventId: string): BracketView {
  const alliances = db
    .select()
    .from(tables.alliances)
    .where(eq(tables.alliances.eventId, eventId))
    .all()
  const numberOf = new Map(alliances.map((a) => [a.id, a.number]))
  const matches = playoffMatches(db, eventId)
  const template =
    alliances.length >= 2 ? bracketTemplate(alliances.length) : []
  const meta = new Map(template.map((m) => [m.slot, m]))

  const final = matches.find((m) => m.bracketSlot === "F")
  const championId =
    final?.status === "posted" && final.winner && final.winner !== "tie"
      ? final.winner === "red"
        ? final.redAllianceId
        : final.blueAllianceId
      : null

  return {
    allianceCount: alliances.length,
    champion: championId
      ? { allianceId: championId, number: numberOf.get(championId) ?? 0 }
      : null,
    matches: matches.map((m) => ({
      ...m,
      redAllianceNumber: m.redAllianceId
        ? (numberOf.get(m.redAllianceId) ?? null)
        : null,
      blueAllianceNumber: m.blueAllianceId
        ? (numberOf.get(m.blueAllianceId) ?? null)
        : null,
      bracket: meta.get(m.bracketSlot ?? "")?.bracket ?? "upper",
      round: meta.get(m.bracketSlot ?? "")?.round ?? 1,
    })),
  }
}
