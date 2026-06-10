import { describe, expect, it } from "vitest"
import type { GameScoreEvent } from "@/shared/score-types"
import {
  PointValues,
  TOWER_STRENGTH,
  boulderCount,
  breached,
  captured,
  opponentTowerStrength,
  stronghold,
} from "./index"
import type { StrongholdScore } from "./index"

function play(
  events: Array<Partial<GameScoreEvent> & { type: string }>
): StrongholdScore {
  return events.reduce<StrongholdScore>(
    (score, e) =>
      stronghold.reduce(score, {
        alliance: "red",
        payload: {},
        matchTimeMs: 0,
        ...e,
      }),
    stronghold.initialScore()
  )
}

const empty = stronghold.initialScore()

describe("stronghold reducer", () => {
  it("starts from a clean slate", () => {
    expect(empty.defenses).toEqual([2, 2, 2, 2, 2])
    expect(opponentTowerStrength(empty)).toBe(TOWER_STRENGTH)
    expect(stronghold.computeTotals(empty, empty, "qualification").total).toBe(
      0
    )
  })

  it("is pure — reduce never mutates its input", () => {
    const before = stronghold.initialScore()
    const snapshot = structuredClone(before)
    stronghold.reduce(before, {
      type: "HIGH_GOAL",
      alliance: "red",
      payload: {},
      matchTimeMs: 0,
    })
    expect(before).toEqual(snapshot)
  })

  it("scores auto reach and cross, with cross superseding reach", () => {
    const score = play([
      { type: "REACH", payload: { robotIndex: 0 } },
      { type: "AUTO_CROSS", payload: { robotIndex: 1, defenseIndex: 0 } },
      { type: "REACH", payload: { robotIndex: 1 } }, // ignored: robot 1 already crossed
    ])
    expect(score.robots[0].auto).toBe("reach")
    expect(score.robots[1].auto).toBe("cross")
    const totals = stronghold.computeTotals(score, empty, "qualification")
    expect(totals.auto).toBe(PointValues.REACH + PointValues.AUTO_CROSS)
  })

  it("scores boulders in all four goals", () => {
    const score = play([
      { type: "AUTO_LOW_GOAL" },
      { type: "AUTO_HIGH_GOAL" },
      { type: "LOW_GOAL" },
      { type: "HIGH_GOAL" },
      { type: "HIGH_GOAL" },
    ])
    expect(boulderCount(score)).toBe(5)
    const totals = stronghold.computeTotals(score, empty, "qualification")
    expect(totals.auto).toBe(
      PointValues.AUTO_LOW_GOAL + PointValues.AUTO_HIGH_GOAL
    )
    expect(totals.teleop).toBe(PointValues.LOW_GOAL + 2 * PointValues.HIGH_GOAL)
  })

  it("scores teleop crossings and damages defenses to a floor of zero", () => {
    const score = play([
      { type: "CROSS", payload: { defenseIndex: 2 } },
      { type: "CROSS", payload: { defenseIndex: 2 } },
      { type: "CROSS", payload: { defenseIndex: 2 } },
    ])
    expect(score.defenses[2]).toBe(0)
    expect(score.crossings.teleop).toBe(3)
    expect(stronghold.computeTotals(score, empty, "qualification").teleop).toBe(
      3 * PointValues.CROSS
    )
  })

  it("scores endgame challenge and scale per robot", () => {
    const score = play([
      { type: "CHALLENGE", payload: { robotIndex: 0 } },
      { type: "SCALE", payload: { robotIndex: 1 } },
    ])
    expect(
      stronghold.computeTotals(score, empty, "qualification").endgame
    ).toBe(PointValues.CHALLENGE + PointValues.SCALE)
  })

  it("credits fouls committed by an alliance to the OPPONENT (source bug fixed)", () => {
    // red commits a foul and a tech foul
    const red = play([{ type: "FOUL" }, { type: "TECH_FOUL" }])
    const blue = stronghold.initialScore()

    const redTotals = stronghold.computeTotals(red, blue, "qualification")
    const blueTotals = stronghold.computeTotals(blue, red, "qualification")

    expect(redTotals.penalty).toBe(0)
    expect(redTotals.total).toBe(0)
    expect(blueTotals.penalty).toBe(PointValues.FOUL + PointValues.TECH_FOUL)
    expect(blueTotals.total).toBe(10)
  })

  it("declares a breach at >=4 defenses with zero strength", () => {
    const damageDefense = (i: number) => [
      { type: "CROSS", payload: { defenseIndex: i } },
      { type: "CROSS", payload: { defenseIndex: i } },
    ]
    const threeDown = play([0, 1, 2].flatMap(damageDefense))
    expect(breached(threeDown)).toBe(false)
    const fourDown = play([0, 1, 2, 3].flatMap(damageDefense))
    expect(breached(fourDown)).toBe(true)
  })

  it("weakens the opposing tower per boulder and repairs it per own tech foul", () => {
    const score = play([
      ...Array.from({ length: 4 }, () => ({ type: "HIGH_GOAL" })),
      { type: "TECH_FOUL" },
    ])
    expect(opponentTowerStrength(score)).toBe(TOWER_STRENGTH - 4 + 1)
  })

  it("requires tower at zero AND all three robots in endgame for a capture", () => {
    const sixGoals = Array.from({ length: 6 }, () => ({ type: "HIGH_GOAL" }))
    const towerDownOnly = play(sixGoals)
    expect(opponentTowerStrength(towerDownOnly)).toBe(0)
    expect(captured(towerDownOnly)).toBe(false)

    const twoRobots = play([
      ...sixGoals,
      { type: "CHALLENGE", payload: { robotIndex: 0 } },
      { type: "SCALE", payload: { robotIndex: 1 } },
    ])
    expect(captured(twoRobots)).toBe(false)

    const allThree = play([
      ...sixGoals,
      { type: "CHALLENGE", payload: { robotIndex: 0 } },
      { type: "SCALE", payload: { robotIndex: 1 } },
      { type: "CHALLENGE", payload: { robotIndex: 2 } },
    ])
    expect(captured(allThree)).toBe(true)
  })

  it("denies a capture when a tech foul keeps the tower above zero", () => {
    const score = play([
      ...Array.from({ length: 6 }, () => ({ type: "HIGH_GOAL" })),
      { type: "TECH_FOUL" },
      { type: "CHALLENGE", payload: { robotIndex: 0 } },
      { type: "CHALLENGE", payload: { robotIndex: 1 } },
      { type: "CHALLENGE", payload: { robotIndex: 2 } },
    ])
    expect(captured(score)).toBe(false)
  })

  it("awards breach and capture bonus points only in playoffs", () => {
    const events = [
      ...[0, 1, 2, 3].flatMap((i) => [
        { type: "CROSS", payload: { defenseIndex: i } },
        { type: "CROSS", payload: { defenseIndex: i } },
      ]),
      ...Array.from({ length: 6 }, () => ({ type: "HIGH_GOAL" })),
      { type: "CHALLENGE", payload: { robotIndex: 0 } },
      { type: "CHALLENGE", payload: { robotIndex: 1 } },
      { type: "SCALE", payload: { robotIndex: 2 } },
    ]
    const score = play(events)

    const qual = stronghold.computeTotals(score, empty, "qualification")
    expect(qual.breach).toBe(true)
    expect(qual.capture).toBe(true)
    expect(qual.bonus).toBe(0)

    const playoff = stronghold.computeTotals(score, empty, "playoff")
    expect(playoff.bonus).toBe(
      PointValues.PLAYOFF_BREACH + PointValues.PLAYOFF_CAPTURE
    )
    expect(playoff.total).toBe(qual.total + 45)
  })

  it("computes a full-match scenario total by hand", () => {
    // red: 2 reaches, 1 auto cross, 1 auto high goal, 3 teleop crossings,
    // 2 low + 1 high goals, 1 challenge + 1 scale, blue commits 1 foul
    const red = play([
      { type: "REACH", payload: { robotIndex: 0 } },
      { type: "REACH", payload: { robotIndex: 1 } },
      { type: "AUTO_CROSS", payload: { robotIndex: 2, defenseIndex: 0 } },
      { type: "AUTO_HIGH_GOAL" },
      { type: "CROSS", payload: { defenseIndex: 1 } },
      { type: "CROSS", payload: { defenseIndex: 2 } },
      { type: "CROSS", payload: { defenseIndex: 3 } },
      { type: "LOW_GOAL" },
      { type: "LOW_GOAL" },
      { type: "HIGH_GOAL" },
      { type: "CHALLENGE", payload: { robotIndex: 0 } },
      { type: "SCALE", payload: { robotIndex: 1 } },
    ])
    const blue = play([{ type: "FOUL" }])
    const totals = stronghold.computeTotals(red, blue, "qualification")
    // auto: 2*2 + 10 + 10 = 24; teleop: 3*5 + 2*2 + 5 = 24; endgame: 5 + 15 = 20; penalty: 5
    expect(totals.auto).toBe(24)
    expect(totals.teleop).toBe(24)
    expect(totals.endgame).toBe(20)
    expect(totals.penalty).toBe(5)
    expect(totals.total).toBe(73)
  })

  it("round-trips: replaying the same events yields identical state", () => {
    const events: Array<Partial<GameScoreEvent> & { type: string }> = [
      { type: "AUTO_CROSS", payload: { robotIndex: 0, defenseIndex: 4 } },
      { type: "HIGH_GOAL" },
      { type: "FOUL" },
      { type: "SCALE", payload: { robotIndex: 2 } },
    ]
    expect(play(events)).toEqual(play(events))
  })

  it("computes RP as 2 for a win, 1 for a tie, 0 for a loss", () => {
    expect(stronghold.computeRP(10, 5)).toBe(2)
    expect(stronghold.computeRP(5, 5)).toBe(1)
    expect(stronghold.computeRP(3, 5)).toBe(0)
  })

  it("ranks by avg RP then auto, endgame, boulders", () => {
    const base = {
      matchesPlayed: 2,
      autoPoints: 0,
      endgamePoints: 0,
      boulders: 0,
    }
    const sorted = [
      { ...base, rp: 2, autoPoints: 10 }, // B
      { ...base, rp: 4 }, // A: higher avg RP
      { ...base, rp: 2, autoPoints: 10, endgamePoints: 5 }, // C? no — same auto, higher endgame than B
    ].sort(stronghold.compareRankings)
    expect(sorted[0].rp).toBe(4)
    expect(sorted[1].endgamePoints).toBe(5)
    expect(sorted[2].endgamePoints).toBe(0)
  })

  it("validates judge payloads via the event type schemas", () => {
    const reach = stronghold.scoreEventTypes.REACH
    expect(reach.payload.safeParse({ robotIndex: 1 }).success).toBe(true)
    expect(reach.payload.safeParse({ robotIndex: 3 }).success).toBe(false)
    const cross = stronghold.scoreEventTypes.CROSS
    expect(cross.payload.safeParse({ defenseIndex: 4 }).success).toBe(true)
    expect(cross.payload.safeParse({ defenseIndex: 5 }).success).toBe(false)
  })
})
