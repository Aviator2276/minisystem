import { beforeEach, describe, expect, it } from "vitest"
import { tables } from "@/db"
import type { Db } from "@/db"
import { createTestDb } from "@/db/db.test"
import { attachTeams, createEvent } from "./events"
import {
  createCustomMatch,
  deleteMatch,
  generateMoreQualMatches,
  listMatches,
} from "./matches"
import { computeRankings } from "./rankings"
import { createTeam } from "./teams"

let db: Db
let eventId: string
let teamIds: string[]

beforeEach(() => {
  db = createTestDb()
  eventId = createEvent(db, { name: "Matches Test" }).id
  teamIds = Array.from({ length: 6 }, (_, i) =>
    createTeam(db, { number: i + 1, name: `T${i + 1}` }).id
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
