import { describe, expect, it } from "vitest"
import { averageBy, computeDefenseScores, computeOPR } from "./advanced-stats"
import type { MatchLine } from "./advanced-stats"

const line = (
  teams: string[],
  total: number,
  extra: { auto?: number; boulders?: number; crosses?: number } = {}
) => ({
  teams,
  total,
  auto: extra.auto ?? 0,
  boulders: extra.boulders ?? 0,
  crosses: extra.crosses ?? 0,
})

describe("averageBy", () => {
  it("averages an alliance value across each team's matches", () => {
    const matches: MatchLine[] = [
      {
        red: line(["a", "b"], 0, { crosses: 6 }),
        blue: line(["c"], 0, { crosses: 2 }),
      },
      {
        red: line(["a"], 0, { crosses: 4 }),
        blue: line(["b", "c"], 0, { crosses: 10 }),
      },
    ]
    const result = new Map(
      averageBy(matches, (s) => s.crosses).map((r) => [r.teamId, r.value])
    )
    expect(result.get("a")).toBeCloseTo((6 + 4) / 2) // 5
    expect(result.get("b")).toBeCloseTo((6 + 10) / 2) // 8
    expect(result.get("c")).toBeCloseTo((2 + 10) / 2) // 6
  })
})

describe("computeOPR", () => {
  it("recovers individual contributions from alliance totals (full-rank set)", () => {
    // true values a=10 b=20 c=30 d=40; every alliance total is their exact sum
    const matches: MatchLine[] = [
      { red: line(["a", "b"], 30), blue: line(["c", "d"], 70) },
      { red: line(["a", "c"], 40), blue: line(["b", "d"], 60) },
      { red: line(["a", "d"], 50), blue: line(["b", "c"], 50) },
    ]
    const opr = computeOPR(matches)
    expect(opr.get("a")!).toBeCloseTo(10, 3)
    expect(opr.get("b")!).toBeCloseTo(20, 3)
    expect(opr.get("c")!).toBeCloseTo(30, 3)
    expect(opr.get("d")!).toBeCloseTo(40, 3)
  })
})

describe("computeDefenseScores", () => {
  it("ranks consistent suppressors above teams whose opponents overperform", () => {
    // opponents expected to score 50 (per OPR). D holds them well under it,
    // W lets them beat it.
    const opr = new Map([
      ["opp1", 25],
      ["opp2", 25],
      ["D", 0],
      ["W", 0],
    ])
    const matches: MatchLine[] = [
      { red: line(["D"], 0), blue: line(["opp1", "opp2"], 30) }, // suppress 20
      { red: line(["D"], 0), blue: line(["opp1", "opp2"], 34) }, // suppress 16
      { red: line(["W"], 0), blue: line(["opp1", "opp2"], 60) }, // suppress -10
      { red: line(["W"], 0), blue: line(["opp1", "opp2"], 64) }, // suppress -14
    ]
    const scores = new Map(
      computeDefenseScores(matches, opr).map((r) => [r.teamId, r.value])
    )
    expect(scores.get("D")!).toBeGreaterThan(scores.get("W")!)
    expect(scores.get("D")!).toBeGreaterThan(0) // genuinely suppressing
    expect(scores.get("W")!).toBeLessThan(0) // opponents overperform
  })

  it("penalizes inconsistent defenders via the variance term", () => {
    const opr = new Map([
      ["opp1", 25],
      ["opp2", 25],
      ["steady", 0],
      ["swingy", 0],
    ])
    // both average a suppression of 20, but swingy is wildly inconsistent
    const matches: MatchLine[] = [
      { red: line(["steady"], 0), blue: line(["opp1", "opp2"], 30) }, // 20
      { red: line(["steady"], 0), blue: line(["opp1", "opp2"], 30) }, // 20
      { red: line(["swingy"], 0), blue: line(["opp1", "opp2"], 10) }, // 40
      { red: line(["swingy"], 0), blue: line(["opp1", "opp2"], 50) }, // 0
    ]
    const scores = new Map(
      computeDefenseScores(matches, opr).map((r) => [r.teamId, r.value])
    )
    expect(scores.get("steady")!).toBeGreaterThan(scores.get("swingy")!)
  })
})
