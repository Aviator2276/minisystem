import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { tables } from "@/db"
import type { Db } from "@/db"
import { createTestDb } from "@/db/db.test"
import { attachTeams, createEvent } from "./events"
import {
  createCustomMatch,
  deleteMatch,
  deleteMatches,
  generateMoreQualMatches,
  listMatches,
  reorderMatches,
} from "./matches"
import { computeRankings } from "./rankings"
import { createTeam } from "./teams"

let db: Db
let eventId: string
let teamIds: string[]

beforeEach(() => {
  db = createTestDb()
  eventId = createEvent(db, { name: "Matches Test" }).id
  teamIds = Array.from(
    { length: 6 },
    (_, i) => createTeam(db, { number: i + 1, name: `T${i + 1}` }).id
  )
  attachTeams(db, eventId, teamIds)
})

describe("generateMoreQualMatches", () => {
  it("appends matches with continuing numbers and order", () => {
    generateMoreQualMatches(db, eventId, 1)
    generateMoreQualMatches(db, eventId, 1)
    const matches = listMatches(db, eventId)
    expect(matches).toHaveLength(2)
    expect(matches.map((m) => m.number)).toEqual([1, 2])
    expect(matches.every((m) => m.type === "qualification")).toBe(true)
    expect(matches[0].scheduledOrder).toBeLessThan(matches[1].scheduledOrder)
  })
})

describe("createCustomMatch", () => {
  it("creates a custom qualification match from picked teams", () => {
    const match = createCustomMatch(db, eventId, {
      matchType: "qualification",
      red: [teamIds[0], teamIds[1], teamIds[2]],
      blue: [teamIds[3], teamIds[4], teamIds[5]],
    })
    expect(match.type).toBe("qualification")
    expect(match.red1).toBe(teamIds[0])
    expect(match.blue3).toBe(teamIds[5])
  })

  it("rejects an empty match and duplicate teams", () => {
    expect(() =>
      createCustomMatch(db, eventId, {
        matchType: "practice",
        red: [null, null, null],
        blue: [null, null, null],
      })
    ).toThrow(/at least one team/)
    expect(() =>
      createCustomMatch(db, eventId, {
        matchType: "practice",
        red: [teamIds[0], null, null],
        blue: [teamIds[0], null, null],
      })
    ).toThrow(/once/)
  })
})

describe("deleteMatch", () => {
  it("removes a match", () => {
    const match = createCustomMatch(db, eventId, {
      matchType: "practice",
      red: [teamIds[0], null, null],
      blue: [teamIds[1], null, null],
    })
    deleteMatch(db, eventId, match.id)
    expect(listMatches(db, eventId)).toHaveLength(0)
  })

  it("refuses to delete a running match", () => {
    const running = db
      .insert(tables.matches)
      .values({
        eventId,
        type: "qualification",
        number: 1,
        scheduledOrder: 1,
        status: "running",
      })
      .returning()
      .get()
    expect(() => deleteMatch(db, eventId, running.id)).toThrow(/running/)
  })
})

describe("deleteMatches", () => {
  it("removes several matches in one call", () => {
    const a = createCustomMatch(db, eventId, {
      matchType: "practice",
      red: [teamIds[0], null, null],
      blue: [teamIds[1], null, null],
    })
    const b = createCustomMatch(db, eventId, {
      matchType: "practice",
      red: [teamIds[2], null, null],
      blue: [teamIds[3], null, null],
    })
    const c = createCustomMatch(db, eventId, {
      matchType: "practice",
      red: [teamIds[4], null, null],
      blue: [teamIds[5], null, null],
    })
    deleteMatches(db, eventId, [a.id, c.id])
    expect(listMatches(db, eventId).map((m) => m.id)).toEqual([b.id])
  })

  it("is all-or-nothing: a running match rejects the whole batch", () => {
    const ok = createCustomMatch(db, eventId, {
      matchType: "practice",
      red: [teamIds[0], null, null],
      blue: [teamIds[1], null, null],
    })
    const running = db
      .insert(tables.matches)
      .values({
        eventId,
        type: "qualification",
        number: 1,
        scheduledOrder: 99,
        status: "running",
      })
      .returning()
      .get()
    expect(() => deleteMatches(db, eventId, [ok.id, running.id])).toThrow(
      /running/
    )
    // the deletable match must still be there — nothing was committed
    expect(
      listMatches(db, eventId)
        .map((m) => m.id)
        .sort()
    ).toEqual([ok.id, running.id].sort())
  })

  it("clears the field's queued match when it is deleted", () => {
    const match = createCustomMatch(db, eventId, {
      matchType: "practice",
      red: [teamIds[0], null, null],
      blue: [teamIds[1], null, null],
    })
    db.update(tables.events)
      .set({ currentMatchId: match.id })
      .where(eq(tables.events.id, eventId))
      .run()
    deleteMatches(db, eventId, [match.id])
    const event = db
      .select()
      .from(tables.events)
      .where(eq(tables.events.id, eventId))
      .get()
    expect(event?.currentMatchId).toBeNull()
  })
})

describe("reorderMatches", () => {
  it("rewrites scheduledOrder to match the new sequence", () => {
    generateMoreQualMatches(db, eventId, 2)
    const before = listMatches(db, eventId)
    expect(before).toHaveLength(2)
    // listMatches sorts by scheduledOrder, so reverse the ids to flip them
    const flipped = [before[1].id, before[0].id]
    reorderMatches(db, eventId, flipped)
    const after = listMatches(db, eventId)
    expect(after.map((m) => m.id)).toEqual(flipped)
    expect(after.map((m) => m.scheduledOrder)).toEqual([1, 2])
  })

  it("rejects a list that isn't a full permutation of the event's matches", () => {
    generateMoreQualMatches(db, eventId, 2)
    const ids = listMatches(db, eventId).map((m) => m.id)
    expect(() => reorderMatches(db, eventId, [ids[0]])).toThrow(/every match/)
    expect(() => reorderMatches(db, eventId, [ids[0], ids[0]])).toThrow(
      /every match/
    )
  })
})

describe("practice matches", () => {
  it("never count toward rankings", () => {
    // a posted practice match with the same teams as a qual match
    for (const type of ["qualification", "practice"] as const) {
      db.insert(tables.matches)
        .values({
          eventId,
          type,
          number: 1,
          scheduledOrder: type === "qualification" ? 1 : 2,
          status: "posted",
          winner: "red",
          redRP: 2,
          red1: teamIds[0],
          red2: teamIds[1],
          red3: teamIds[2],
          blue1: teamIds[3],
          blue2: teamIds[4],
          blue3: teamIds[5],
        })
        .run()
    }
    const rankings = computeRankings(db, eventId)
    // each team played exactly one *qualification* match, practice ignored
    expect(rankings.every((r) => r.matchesPlayed === 1)).toBe(true)
  })
})
