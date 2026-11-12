import { and, asc, desc, eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import { getEventInStatus } from "@/server/services/events"
import { MAX_PLAYOFF_ALLIANCES } from "@/server/selection/state-machine"
import { bracketTemplate, expandFinalsBestOf3 } from "./templates"

type MatchRow = typeof tables.matches.$inferSelect
type AllianceRow = typeof tables.alliances.$inferSelect

/**
 * Creates the playoff match rows for an event from its bracket template.
 * Seed sources resolve immediately; winner/loser sources resolve as their
 * feeder matches post. Regeneration is allowed until a playoff match posts.
 */
export function generateBracket(db: Db, eventId: string) {
  const event = getEventInStatus(db, eventId, ["playoffs"])
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

  // only the top 8 seeds make the bracket; any surplus alliances sit out
  const seededCount = Math.min(alliances.length, MAX_PLAYOFF_ALLIANCES)
  const baseTemplate = bracketTemplate(seededCount)
  const template = event.settings.finalsBestOf3
    ? expandFinalsBestOf3(baseTemplate)
    : baseTemplate
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

/**
 * Swaps the finals between a single "F" match and a best-of-3 series
 * (F1/F2/F3) in place, leaving the rest of the bracket untouched. This is how
 * the format changes mid-playoffs, when posted results block a full
 * regeneration. Allowed until a finals match is loaded on the field, running,
 * or has results. Returns true when the bracket was reshaped, false when it
 * was already in the requested shape (or no bracket exists yet).
 */
export function reshapeFinals(db: Db, eventId: string, bestOf3: boolean) {
  const event = getEventInStatus(db, eventId, ["playoffs"])
  const matches = playoffMatches(db, eventId)
  // `F`, `F1`..`F<n>` — an extended series can run past F3, so match any F-digit
  const finals = matches.filter((m) => /^F\d*$/.test(m.bracketSlot ?? ""))
  if (finals.length === 0) return false
  const isSeries = finals.some((m) => m.bracketSlot !== "F")
  if (isSeries === bestOf3) return false

  const started = finals.find(
    (m) => m.status !== "scheduled" || m.id === event.currentMatchId
  )
  if (started) {
    throw new Error(
      started.status === "posted"
        ? "Can't change the finals format — a finals match already has posted results"
        : "Can't change the finals format while a finals match is on the field — clear it from match control first"
    )
  }

  const alliances = db
    .select({ id: tables.alliances.id })
    .from(tables.alliances)
    .where(eq(tables.alliances.eventId, eventId))
    .all()
  const seededCount = Math.min(alliances.length, MAX_PLAYOFF_ALLIANCES)
  const finalTemplate = bracketTemplate(seededCount).find(
    (m) => m.slot === "F"
  )
  if (!finalTemplate) return false

  const first = finals[0]
  const maxNumber = Math.max(...matches.map((m) => m.number))
  const maxOrder = db
    .select({ value: tables.matches.scheduledOrder })
    .from(tables.matches)
    .where(eq(tables.matches.eventId, eventId))
    .orderBy(desc(tables.matches.scheduledOrder))
    .limit(1)
    .get()

  db.transaction((tx) => {
    for (const f of finals) {
      tx.delete(tables.matches).where(eq(tables.matches.id, f.id)).run()
    }
    const games = bestOf3
      ? [
          { slot: "F1", red: finalTemplate.red, blue: finalTemplate.blue },
          // game 2 swaps colors to even out any field advantage
          { slot: "F2", red: finalTemplate.blue, blue: finalTemplate.red },
          { slot: "F3", red: finalTemplate.red, blue: finalTemplate.blue },
        ]
      : [{ slot: "F", red: finalTemplate.red, blue: finalTemplate.blue }]
    games.forEach((g, i) => {
      tx.insert(tables.matches)
        .values({
          eventId,
          type: "playoff",
          number: i === 0 ? first.number : maxNumber + i,
          bracketSlot: g.slot,
          redSource: g.red,
          blueSource: g.blue,
          scheduledOrder:
            i === 0 ? first.scheduledOrder : (maxOrder?.value ?? 0) + i,
        })
        .run()
    })
    resolveBracket(tx, eventId)
  })
  return true
}

/**
 * Creates an off-bracket "extra" playoff match between two existing alliances.
 * It has no `bracketSlot` and no sources, so `resolveBracket`, the champion
 * math, and the bracket graphic all ignore it — but the alliances are
 * denormalized into red1/2/3(/4) so it queues, scores, and displays like any
 * other match. Used for exhibition/re-play matches outside the double-elim run.
 */
export function createExtraPlayoffMatch(
  db: Db,
  eventId: string,
  redAllianceNumber: number,
  blueAllianceNumber: number
): MatchRow {
  getEventInStatus(db, eventId, ["playoffs"])
  if (redAllianceNumber === blueAllianceNumber) {
    throw new Error("Pick two different alliances")
  }
  const alliances = db
    .select()
    .from(tables.alliances)
    .where(eq(tables.alliances.eventId, eventId))
    .all()
  const bySeed = new Map(alliances.map((a) => [a.number, a]))
  const red = bySeed.get(redAllianceNumber)
  const blue = bySeed.get(blueAllianceNumber)
  if (!red || !blue) throw new Error("Alliance not found")

  return db.transaction((tx) => {
    const maxNumber = tx
      .select({ value: tables.matches.number })
      .from(tables.matches)
      .where(
        and(
          eq(tables.matches.eventId, eventId),
          eq(tables.matches.type, "playoff")
        )
      )
      .orderBy(desc(tables.matches.number))
      .limit(1)
      .get()
    const maxOrder = tx
      .select({ value: tables.matches.scheduledOrder })
      .from(tables.matches)
      .where(eq(tables.matches.eventId, eventId))
      .orderBy(desc(tables.matches.scheduledOrder))
      .limit(1)
      .get()
    return tx
      .insert(tables.matches)
      .values({
        eventId,
        type: "playoff",
        number: (maxNumber?.value ?? 0) + 1,
        scheduledOrder: (maxOrder?.value ?? 0) + 1,
        redAllianceId: red.id,
        blueAllianceId: blue.id,
        red1: red.captainTeamId,
        red2: red.pick1TeamId,
        red3: red.pick2TeamId,
        red4: red.backupTeamId,
        blue1: blue.captainTeamId,
        blue2: blue.pick1TeamId,
        blue3: blue.pick2TeamId,
        blue4: blue.backupTeamId,
      })
      .returning()
      .get()
  })
}

/**
 * Appends one more game to the grand-final series between the same two
 * finalists. A single "F" becomes "F1"+"F2"; a best-of-3 (F1/F2/F3) becomes
 * F1..F4, and so on. Even-numbered games swap red/blue to even out field bias
 * (matching {@link expandFinalsBestOf3}). Allowed only once both finalists are
 * decided; unlike a format change it is intentionally NOT blocked by posted
 * finals — adding a game to a settled 2-0 lead raises `winsNeeded` and reopens
 * the championship on purpose.
 */
export function extendFinalsSeries(db: Db, eventId: string): boolean {
  getEventInStatus(db, eventId, ["playoffs"])
  const matches = playoffMatches(db, eventId)
  const finals = matches.filter((m) => /^F\d*$/.test(m.bracketSlot ?? ""))
  if (finals.length === 0) throw new Error("No finals to extend")

  const anchor = finals[0]
  if (!anchor.redAllianceId || !anchor.blueAllianceId) {
    throw new Error("The finals participants aren't decided yet")
  }

  const alliances = db
    .select({ id: tables.alliances.id })
    .from(tables.alliances)
    .where(eq(tables.alliances.eventId, eventId))
    .all()
  const seededCount = Math.min(alliances.length, MAX_PLAYOFF_ALLIANCES)
  const finalTemplate = bracketTemplate(seededCount).find((m) => m.slot === "F")
  if (!finalTemplate) return false

  const nextIndex = finals.length + 1
  const swap = nextIndex % 2 === 0 // even games swap colors, like F2
  const newSlot = `F${nextIndex}`
  const maxNumber = Math.max(...matches.map((m) => m.number))
  const maxOrder = db
    .select({ value: tables.matches.scheduledOrder })
    .from(tables.matches)
    .where(eq(tables.matches.eventId, eventId))
    .orderBy(desc(tables.matches.scheduledOrder))
    .limit(1)
    .get()

  db.transaction((tx) => {
    // a lone single final becomes game 1 of the new series
    if (finals.length === 1 && anchor.bracketSlot === "F") {
      tx.update(tables.matches)
        .set({ bracketSlot: "F1" })
        .where(eq(tables.matches.id, anchor.id))
        .run()
    }
    tx.insert(tables.matches)
      .values({
        eventId,
        type: "playoff",
        number: maxNumber + 1,
        bracketSlot: newSlot,
        redSource: swap ? finalTemplate.blue : finalTemplate.red,
        blueSource: swap ? finalTemplate.red : finalTemplate.blue,
        scheduledOrder: (maxOrder?.value ?? 0) + 1,
      })
      .run()
    resolveBracket(tx, eventId)
  })
  return true
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
      update.red4 = red.backupTeamId
    } else if (red && match.red4 !== red.backupTeamId) {
      // same alliance, but its backup robot was added/removed/changed
      update.red4 = red.backupTeamId
    }
    if (blue && match.blueAllianceId !== blue.id) {
      update.blueAllianceId = blue.id
      update.blue1 = blue.captainTeamId
      update.blue2 = blue.pick1TeamId
      update.blue3 = blue.pick2TeamId
      update.blue4 = blue.backupTeamId
    } else if (blue && match.blue4 !== blue.backupTeamId) {
      update.blue4 = blue.backupTeamId
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
  const seededCount = Math.min(alliances.length, MAX_PLAYOFF_ALLIANCES)
  const template = seededCount >= 2 ? bracketTemplate(seededCount) : []
  const meta = new Map(template.map((m) => [m.slot, m]))
  // the base template only has a single "F" slot; a best-of-3 series (F1/F2/F3)
  // isn't in it, so place each finals game in its own round to the right of the
  // bracket's last round, keeping them in a left-to-right row in the final lane
  const finalRound = template.find((m) => m.slot === "F")?.round ?? 1
  function slotMeta(slot: string): { bracket: string; round: number } {
    const direct = meta.get(slot)
    if (direct) return { bracket: direct.bracket, round: direct.round }
    const fm = /^F(\d+)$/.exec(slot)
    if (fm) return { bracket: "final", round: finalRound + Number(fm[1]) - 1 }
    return { bracket: "upper", round: 1 }
  }

  // the champion is decided by the finals: a single "F" match, or a series
  // (F1/F2/F3/…) where the first alliance to win the majority of games wins.
  // A series can be extended past best-of-3, so match any F-digit slot.
  const finals = matches.filter((m) => /^F\d*$/.test(m.bracketSlot ?? ""))
  const winsNeeded = Math.floor(finals.length / 2) + 1
  const winCounts = new Map<string, number>()
  for (const f of finals) {
    if (f.status !== "posted" || !f.winner || f.winner === "tie") continue
    const id = f.winner === "red" ? f.redAllianceId : f.blueAllianceId
    if (id) winCounts.set(id, (winCounts.get(id) ?? 0) + 1)
  }
  let championId: string | null = null
  for (const [id, wins] of winCounts) {
    if (wins >= winsNeeded) championId = id
  }

  return {
    allianceCount: alliances.length,
    champion: championId
      ? { allianceId: championId, number: numberOf.get(championId) ?? 0 }
      : null,
    matches: matches.map((m) => {
      const sm = slotMeta(m.bracketSlot ?? "")
      return {
        ...m,
        redAllianceNumber: m.redAllianceId
          ? (numberOf.get(m.redAllianceId) ?? null)
          : null,
        blueAllianceNumber: m.blueAllianceId
          ? (numberOf.get(m.blueAllianceId) ?? null)
          : null,
        bracket: sm.bracket,
        round: sm.round,
      }
    }),
  }
}
