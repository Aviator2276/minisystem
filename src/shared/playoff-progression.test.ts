import { describe, expect, it } from "vitest"
import { matchProgression } from "./playoff-progression"
import type { BracketMatchLite } from "./playoff-progression"

// the 4-alliance double-elim template (T4)
const T4: BracketMatchLite[] = [
  {
    bracketSlot: "M1",
    bracket: "upper",
    number: 1,
    redSource: "seed:1",
    blueSource: "seed:4",
  },
  {
    bracketSlot: "M2",
    bracket: "upper",
    number: 2,
    redSource: "seed:2",
    blueSource: "seed:3",
  },
  {
    bracketSlot: "M3",
    bracket: "lower",
    number: 3,
    redSource: "loser:M1",
    blueSource: "loser:M2",
  },
  {
    bracketSlot: "M4",
    bracket: "upper",
    number: 4,
    redSource: "winner:M1",
    blueSource: "winner:M2",
  },
  {
    bracketSlot: "M5",
    bracket: "lower",
    number: 5,
    redSource: "loser:M4",
    blueSource: "winner:M3",
  },
  {
    bracketSlot: "F",
    bracket: "final",
    number: 6,
    redSource: "winner:M5",
    blueSource: "winner:M4",
  },
]

describe("matchProgression", () => {
  it("upper-bracket match: winner advances, loser drops (not elimination)", () => {
    const p = matchProgression(T4, "M1")!
    expect(p.isElimination).toBe(false)
    expect(p.winner?.label).toBe("Upper bracket match 4")
    expect(p.loser?.label).toBe("Lower bracket match 3")
  })

  it("lower-bracket match: loser is eliminated", () => {
    const p = matchProgression(T4, "M3")!
    expect(p.isElimination).toBe(true)
    expect(p.winner?.label).toBe("Lower bracket match 5")
    expect(p.loser).toBeNull()
  })

  it("loser of an upper-bracket match drops into the lower bracket", () => {
    const p = matchProgression(T4, "M4")!
    expect(p.isElimination).toBe(false)
    expect(p.winner?.label).toBe("the Grand Final")
    expect(p.loser?.label).toBe("Lower bracket match 5")
  })

  it("the grand final: winner has no next match, loser is eliminated", () => {
    const p = matchProgression(T4, "F")!
    expect(p.isFinal).toBe(true)
    expect(p.isElimination).toBe(true)
    expect(p.winner).toBeNull()
    expect(p.loser).toBeNull()
  })

  it("best-of-3 series games are not single-game eliminations", () => {
    const series: BracketMatchLite[] = [
      {
        bracketSlot: "F1",
        bracket: "final",
        number: 6,
        redSource: "winner:M5",
        blueSource: "winner:M4",
      },
      {
        bracketSlot: "F2",
        bracket: "final",
        number: 7,
        redSource: "winner:M4",
        blueSource: "winner:M5",
      },
      {
        bracketSlot: "F3",
        bracket: "final",
        number: 8,
        redSource: "winner:M5",
        blueSource: "winner:M4",
      },
    ]
    const p = matchProgression(series, "F1")!
    expect(p.isSeriesGame).toBe(true)
    expect(p.isFinal).toBe(true)
    expect(p.isElimination).toBe(false)
  })

  it("returns null without a slot", () => {
    expect(matchProgression(T4, null)).toBeNull()
  })
})
