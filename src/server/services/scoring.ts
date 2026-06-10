import { and, asc, eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import type { AllianceColor } from "@/db/schema"
import { getGame } from "@/games"
import type { JsonObject } from "@/shared/json"
import type { GameScoreEvent, ScoreTotals } from "@/shared/score-types"
import { getEvent } from "./events"
import { getMatch } from "./matches"

export interface CachedAllianceScore {
  state: unknown
  totals: ScoreTotals
}

export function recordScoreEvent(
  db: Db,
  input: {
    matchId: string
    alliance: AllianceColor
    type: string
    payload: Record<string, unknown>
    createdBy: string
  }
) {
  const match = getMatch(db, input.matchId)
  const game = getGame(getEvent(db, match.eventId).gameId)

  const def = (
    game.scoreEventTypes as Record<
      string,
      (typeof game.scoreEventTypes)[string] | undefined
    >
  )[input.type]
  if (!def)
    throw new Error(
      `Unknown score event type '${input.type}' for game ${game.id}`
    )
  const payload = def.payload.parse(input.payload) as JsonObject

  // server-computed; client clocks are never trusted
  const matchTimeMs = match.startedAt
    ? Math.max(
        0,
        Math.min(Date.now() - match.startedAt.getTime(), game.matchLengthMs)
      )
    : 0

  return db.transaction((tx) => {
    const event = tx
      .insert(tables.scoreEvents)
      .values({ ...input, payload, matchTimeMs })
      .returning()
      .get()
    recomputeMatchScore(tx, input.matchId)
    return event
  })
}

export function undoScoreEvent(db: Db, scoreEventId: string) {
  return db.transaction((tx) => {
    const event = tx
      .update(tables.scoreEvents)
      .set({ undone: true })
      .where(eq(tables.scoreEvents.id, scoreEventId))
      .returning()
      .get() as typeof tables.scoreEvents.$inferSelect | undefined
    if (!event) throw new Error("Score event not found")
    recomputeMatchScore(tx, event.matchId)
    return event
  })
}

/** replays all non-undone score events through the game reducer and caches the result */
export function recomputeMatchScore(db: Db, matchId: string) {
  const match = getMatch(db, matchId)
  const game = getGame(getEvent(db, match.eventId).gameId)

  const events = db
    .select()
    .from(tables.scoreEvents)
    .where(
      and(
        eq(tables.scoreEvents.matchId, matchId),
        eq(tables.scoreEvents.undone, false)
      )
    )
    .orderBy(asc(tables.scoreEvents.createdAt), asc(tables.scoreEvents.id))
    .all()

  const states: Record<AllianceColor, unknown> = {
    red: game.initialScore(),
    blue: game.initialScore(),
  }
  for (const e of events) {
    const gameEvent: GameScoreEvent = {
      type: e.type,
      alliance: e.alliance,
      payload: e.payload,
      matchTimeMs: e.matchTimeMs,
    }
    states[e.alliance] = game.reduce(states[e.alliance], gameEvent)
  }

  const redTotals = game.computeTotals(states.red, states.blue, match.type)
  const blueTotals = game.computeTotals(states.blue, states.red, match.type)

  const redScore: CachedAllianceScore = { state: states.red, totals: redTotals }
  const blueScore: CachedAllianceScore = {
    state: states.blue,
    totals: blueTotals,
  }

  return db
    .update(tables.matches)
    .set({
      redScore: redScore as unknown as JsonObject,
      blueScore: blueScore as unknown as JsonObject,
      redPoints: redTotals.total,
      bluePoints: blueTotals.total,
    })
    .where(eq(tables.matches.id, matchId))
    .returning()
    .get()
}

/** finalizes a match: winner + RP become official and the match counts for rankings */
export function postMatch(db: Db, matchId: string) {
  return db.transaction((tx) => {
    const match = recomputeMatchScore(tx, matchId)
    const game = getGame(getEvent(tx, match.eventId).gameId)
    const red = match.redPoints ?? 0
    const blue = match.bluePoints ?? 0
    return tx
      .update(tables.matches)
      .set({
        status: "posted",
        winner: red > blue ? "red" : blue > red ? "blue" : "tie",
        redRP: game.computeRP(red, blue),
        blueRP: game.computeRP(blue, red),
      })
      .where(eq(tables.matches.id, matchId))
      .returning()
      .get()
  })
}

/** used by replays: drops all score events and clears cached aggregates */
export function resetMatchScores(db: Db, matchId: string) {
  return db.transaction((tx) => {
    tx.delete(tables.scoreEvents)
      .where(eq(tables.scoreEvents.matchId, matchId))
      .run()
    return tx
      .update(tables.matches)
      .set({
        redScore: null,
        blueScore: null,
        redPoints: null,
        bluePoints: null,
        redRP: null,
        blueRP: null,
        winner: null,
        status: "scheduled",
        startedAt: null,
      })
      .where(eq(tables.matches.id, matchId))
      .returning()
      .get()
  })
}

export function listScoreEvents(db: Db, matchId: string) {
  return db
    .select()
    .from(tables.scoreEvents)
    .where(eq(tables.scoreEvents.matchId, matchId))
    .orderBy(asc(tables.scoreEvents.createdAt))
    .all()
}
