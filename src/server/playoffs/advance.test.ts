import { beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import { createTestDb } from "@/db/db.test"
import { createEvent } from "@/server/services/events"
import { postMatch, recordScoreEvent } from "@/server/services/scoring"
import { createTeam } from "@/server/services/teams"
import {
  generateBracket,
  getBracket,
  playoffMatches,
  resolveBracket,
} from "./advance"
import { bracketTemplate } from "./templates"

let db: Db
let eventId: string
let adminId: string

function setupAlliances(count: number) {
  // 3 teams per alliance
  let teamNumber = 1
  for (let n = 1; n <= count; n++) {
    const ids = Array.from({ length: 3 }, () => {
      const team = createTeam(db, {
        number: teamNumber,
        name: `Team ${teamNumber}`,
      })
      teamNumber += 1
      return team.id
    })
    db.insert(tables.alliances)
      .values({
        eventId,
        number: n,
        captainTeamId: ids[0],
        pick1TeamId: ids[1],
        pick2TeamId: ids[2],
      })
      .run()
  }
}

/** posts a playoff match with the given winner, bypassing the scoring UI */
function decide(matchId: string, winner: "red" | "blue") {
  db.update(tables.matches)
    .set({
      status: "posted",
      winner,
      redPoints: winner === "red" ? 10 : 5,
      bluePoints: winner === "red" ? 5 : 10,
    })
    .where(eq(tables.matches.id, matchId))
    .run()
  const match = db
    .select()
    .from(tables.matches)
    .where(eq(tables.matches.id, matchId))
    .get()!
  resolveBracket(db, match.eventId)
}

/** plays the whole bracket: the higher-seeded alliance always wins */
function playItOut() {
  for (let guard = 0; guard < 32; guard++) {
    const next = playoffMatches(db, eventId).find(
      (m) => m.status !== "posted" && m.redAllianceId && m.blueAllianceId
    )
    if (!next) return
    const bracket = getBracket(db, eventId)
    const view = bracket.matches.find((m) => m.id === next.id)!
    decide(
      next.id,
      view.redAllianceNumber! <= view.blueAllianceNumber! ? "red" : "blue"
    )
  }
  throw new Error("bracket never finished")
}

beforeEach(() => {
  db = createTestDb()
  adminId = db
    .insert(tables.users)
    .values({ role: "admin", username: "a", passwordHash: "x" })
    .returning()
    .get().id
  eventId = createEvent(db, { name: "Playoff Test" }).id
  db.update(tables.events)
    .set({ status: "playoffs" })
    .where(eq(tables.events.id, eventId))
    .run()
})

describe("bracket templates", () => {
  it("every count 2-8 has 2N-2 matches and consumes each loser exactly once", () => {
    for (let n = 2; n <= 8; n++) {
      const template = bracketTemplate(n)
      // 2 alliances degenerate to a single grand final
      expect(template.length, `count ${n}`).toBe(n === 2 ? 1 : 2 * n - 2)
      const slots = new Set(template.map((m) => m.slot))
      expect(slots.size).toBe(template.length)
      // every non-final match's winner and loser are each consumed exactly
      // once downstream (except the final's winner = champion, loser = done)
      const sources = template.flatMap((m) => [m.red, m.blue])
      for (const m of template) {
        if (m.slot === "F") continue
        expect(
          sources.filter((s) => s === `winner:${m.slot}`).length,
          `winner:${m.slot} in ${n}`
        ).toBe(1)
        const loserUses = sources.filter((s) => s === `loser:${m.slot}`).length
        expect(loserUses, `loser:${m.slot} in ${n}`).toBeLessThanOrEqual(1)
      }
      // every seed appears exactly once
      for (let seed = 1; seed <= n; seed++) {
        expect(sources.filter((s) => s === `seed:${seed}`).length).toBe(1)
      }
    }
  })
})

describe("bracket generation + advancement", () => {
  it("8 alliances: seeds resolve immediately, plays to a champion", () => {
    setupAlliances(8)
    const matches = generateBracket(db, eventId)
    expect(matches).toHaveLength(14)
    // R1 fully resolved, dependents pending
    const m1 = matches.find((m) => m.bracketSlot === "M1")!
    expect(m1.redAllianceId).not.toBeNull()
    expect(m1.red1).not.toBeNull()
    expect(
      matches.find((m) => m.bracketSlot === "M7")!.redAllianceId
    ).toBeNull()

    playItOut()
    const bracket = getBracket(db, eventId)
    expect(bracket.champion?.number).toBe(1)
    expect(bracket.matches.every((m) => m.status === "posted")).toBe(true)
  })

  it("5 alliances: plays to a champion through the play-in", () => {
    setupAlliances(5)
    expect(generateBracket(db, eventId)).toHaveLength(8)
    playItOut()
    expect(getBracket(db, eventId).champion?.number).toBe(1)
  })

  it("an upset routes the loser through the lower bracket", () => {
    setupAlliances(4)
    generateBracket(db, eventId)
    const bySlot = () =>
      new Map(playoffMatches(db, eventId).map((m) => [m.bracketSlot, m]))
    // M1: 1v4 → 4 wins (upset). M2: 2v3 → 2 wins.
    decide(bySlot().get("M1")!.id, "blue")
    decide(bySlot().get("M2")!.id, "red")
    // M3 (lower): loser M1 (=1) vs loser M2 (=3)
    const m3 = bySlot().get("M3")!
    const view = getBracket(db, eventId).matches.find(
      (m) => m.bracketSlot === "M3"
    )!
    expect([view.redAllianceNumber, view.blueAllianceNumber].sort()).toEqual([
      1, 3,
    ])
    decide(m3.id, view.redAllianceNumber === 1 ? "red" : "blue") // 1 survives
    // M4 (upper final): 4 vs 2 → 2 wins; M5: loser M4 (=4) vs winner M3 (=1)
    decide(
      bySlot().get("M4")!.id,
      getBracket(db, eventId).matches.find((m) => m.bracketSlot === "M4")!
        .redAllianceNumber === 2
        ? "red"
        : "blue"
    )
    const m5view = getBracket(db, eventId).matches.find(
      (m) => m.bracketSlot === "M5"
    )!
    expect(
      [m5view.redAllianceNumber, m5view.blueAllianceNumber].sort()
    ).toEqual([1, 4])
    decide(
      bySlot().get("M5")!.id,
      m5view.redAllianceNumber === 1 ? "red" : "blue"
    )
    // F: 2 vs 1 → alliance 1 completes the lower-bracket run
    const f = getBracket(db, eventId).matches.find(
      (m) => m.bracketSlot === "F"
    )!
    decide(f.id, f.redAllianceNumber === 1 ? "red" : "blue")
    expect(getBracket(db, eventId).champion?.number).toBe(1)
  })

  it("rejects playoff ties at post time", () => {
    setupAlliances(2)
    generateBracket(db, eventId)
    const final = playoffMatches(db, eventId)[0]
    // equal scores via real scoring pipeline
    recordScoreEvent(db, {
      matchId: final.id,
      alliance: "red",
      type: "HIGH_GOAL",
      payload: {},
      createdBy: adminId,
    })
    recordScoreEvent(db, {
      matchId: final.id,
      alliance: "blue",
      type: "HIGH_GOAL",
      payload: {},
      createdBy: adminId,
    })
    expect(() => postMatch(db, final.id)).toThrow(/tie/)
  })

  it("refuses regeneration once results are posted", () => {
    setupAlliances(4)
    generateBracket(db, eventId)
    decide(playoffMatches(db, eventId)[0].id, "red")
    expect(() => generateBracket(db, eventId)).toThrow(/no longer/)
  })
})
