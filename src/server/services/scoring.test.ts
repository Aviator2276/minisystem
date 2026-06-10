import { beforeEach, describe, expect, it } from "vitest"
import { tables } from "@/db"
import type { Db } from "@/db"
import { createTestDb } from "@/db/db.test"
import { PointValues } from "@/games/stronghold"
import { attachTeams, createEvent } from "./events"
import { computeRankings } from "./rankings"
import {
  postMatch,
  recordScoreEvent,
  resetMatchScores,
  undoScoreEvent,
} from "./scoring"
import type { CachedAllianceScore } from "./scoring"
import { createTeam } from "./teams"

let db: Db
let adminId: string
let eventId: string
let teamIds: string[]

function makeMatch(
  number: number,
  red: string[],
  blue: string[],
  extra: Partial<typeof tables.matches.$inferInsert> = {}
) {
  return db
    .insert(tables.matches)
    .values({
      eventId,
      type: "qualification",
      number,
      scheduledOrder: number,
      red1: red[0],
      red2: red[1],
      red3: red[2],
      blue1: blue[0],
      blue2: blue[1],
      blue3: blue[2],
      ...extra,
    })
    .returning()
    .get()
}

function score(
  matchId: string,
  alliance: "red" | "blue",
  type: string,
  payload: Record<string, unknown> = {}
) {
  return recordScoreEvent(db, {
    matchId,
    alliance,
    type,
    payload,
    createdBy: adminId,
  })
}

beforeEach(() => {
  db = createTestDb()
  adminId = db
    .insert(tables.users)
    .values({ role: "admin", username: "admin", passwordHash: "x" })
    .returning()
    .get().id
  eventId = createEvent(db, { name: "Test Event" }).id
  teamIds = Array.from(
    { length: 6 },
    (_, i) => createTeam(db, { number: i + 1, name: `Team ${i + 1}` }).id
  )
  attachTeams(db, eventId, teamIds)
})

describe("scoring pipeline", () => {
  it("records events, caches aggregates, and posts winner + RP", () => {
    const match = makeMatch(1, teamIds.slice(0, 3), teamIds.slice(3, 6))

    score(match.id, "red", "AUTO_HIGH_GOAL")
    score(match.id, "red", "HIGH_GOAL")
    score(match.id, "blue", "LOW_GOAL")
    score(match.id, "red", "FOUL") // red commits a foul: 5 points to blue

    const posted = postMatch(db, match.id)
    expect(posted.redPoints).toBe(
      PointValues.AUTO_HIGH_GOAL + PointValues.HIGH_GOAL
    ) // 15
    expect(posted.bluePoints).toBe(PointValues.LOW_GOAL + PointValues.FOUL) // 7
    expect(posted.winner).toBe("red")
    expect(posted.redRP).toBe(2)
    expect(posted.blueRP).toBe(0)
    const cached = posted.redScore as unknown as CachedAllianceScore
    expect(cached.totals.total).toBe(15)
  })

  it("rejects unknown event types and invalid payloads", () => {
    const match = makeMatch(1, teamIds.slice(0, 3), teamIds.slice(3, 6))
    expect(() => score(match.id, "red", "CARGO")).toThrow(
      /Unknown score event type/
    )
    expect(() => score(match.id, "red", "REACH", { robotIndex: 9 })).toThrow()
  })

  it("undo recomputes the cached aggregates", () => {
    const match = makeMatch(1, teamIds.slice(0, 3), teamIds.slice(3, 6))
    score(match.id, "red", "HIGH_GOAL")
    const second = score(match.id, "red", "HIGH_GOAL")
    undoScoreEvent(db, second.id)
    const posted = postMatch(db, match.id)
    expect(posted.redPoints).toBe(PointValues.HIGH_GOAL)
  })

  it("computes matchTimeMs from the server clock when the match is running", () => {
    const match = makeMatch(1, teamIds.slice(0, 3), teamIds.slice(3, 6), {
      startedAt: new Date(Date.now() - 20_000),
      status: "running",
    })
    const event = score(match.id, "red", "CROSS", { defenseIndex: 0 })
    expect(event.matchTimeMs).toBeGreaterThanOrEqual(19_000)
    expect(event.matchTimeMs).toBeLessThanOrEqual(21_000)
  })

  it("resets a match for replay", () => {
    const match = makeMatch(1, teamIds.slice(0, 3), teamIds.slice(3, 6))
    score(match.id, "red", "HIGH_GOAL")
    postMatch(db, match.id)
    const reset = resetMatchScores(db, match.id)
    expect(reset.redPoints).toBeNull()
    expect(reset.status).toBe("scheduled")
    expect(reset.winner).toBeNull()
  })
})

describe("rankings", () => {
  it("ranks two hand-computed matches correctly", () => {
    const [t1, t2, t3, t4, t5, t6] = teamIds
    // match 1: red(t1,t2,t3) 15 - 2 blue(t4,t5,t6)
    const m1 = makeMatch(1, [t1, t2, t3], [t4, t5, t6])
    score(m1.id, "red", "AUTO_HIGH_GOAL")
    score(m1.id, "red", "HIGH_GOAL")
    score(m1.id, "blue", "LOW_GOAL")
    postMatch(db, m1.id)
    // match 2: red(t1,t4,t5) ties blue(t2,t3,t6) 5-5
    const m2 = makeMatch(2, [t1, t4, t5], [t2, t3, t6])
    score(m2.id, "red", "HIGH_GOAL")
    score(m2.id, "blue", "HIGH_GOAL")
    postMatch(db, m2.id)

    const rankings = computeRankings(db, eventId)
    const byNumber = new Map(rankings.map((r) => [r.number, r]))

    // t1: W + T = 3 RP over 2 matches (1.5 avg); t2,t3: W + T = 3 RP (1.5 avg)
    // t1 tiebreak: auto 10 vs t2/t3 auto 10 — equal; endgame 0 all; boulders t1: 2+1=3, t2/t3: 2+1=3 — full tie
    expect(byNumber.get(1)!.rp).toBe(3)
    expect(byNumber.get(2)!.rp).toBe(3)
    expect(byNumber.get(4)!.rp).toBe(1) // L + T
    expect(byNumber.get(6)!.rp).toBe(1)
    expect(
      rankings
        .slice(0, 3)
        .map((r) => r.number)
        .sort()
    ).toEqual([1, 2, 3])
    expect(rankings[0].rank).toBe(1)
  })

  it("excludes surrogate appearances from rankings", () => {
    const [t1, t2, t3, t4, t5, t6] = teamIds
    const m1 = makeMatch(1, [t1, t2, t3], [t4, t5, t6], { surrogates: [t1] })
    score(m1.id, "red", "HIGH_GOAL")
    postMatch(db, m1.id)

    const rankings = computeRankings(db, eventId)
    const t1Row = rankings.find((r) => r.number === 1)!
    const t2Row = rankings.find((r) => r.number === 2)!
    expect(t1Row.matchesPlayed).toBe(0)
    expect(t1Row.rp).toBe(0)
    expect(t2Row.matchesPlayed).toBe(1)
    expect(t2Row.rp).toBe(2)
  })
})
