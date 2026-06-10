import { describe, expect, it } from "vitest"
import { generateQualSchedule } from "./matchmaker"
import type { ScheduledQualMatch } from "./matchmaker"

// deterministic LCG so test runs are reproducible
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function teamIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `team-${i + 1}`)
}

function appearanceCounts(
  matches: ScheduledQualMatch[]
): Map<string, { real: number; surrogate: number }> {
  const counts = new Map<string, { real: number; surrogate: number }>()
  for (const match of matches) {
    for (const teamId of [...match.red, ...match.blue]) {
      const entry = counts.get(teamId) ?? { real: 0, surrogate: 0 }
      if (match.surrogates.includes(teamId)) entry.surrogate += 1
      else entry.real += 1
      counts.set(teamId, entry)
    }
  }
  return counts
}

function assertValidSchedule(
  teams: string[],
  rounds: number,
  matches: ScheduledQualMatch[]
) {
  const slots = teams.length * rounds
  const expectedMatches = Math.ceil(slots / 6)
  expect(matches.length).toBe(expectedMatches)
  expect(matches.map((m) => m.number)).toEqual(matches.map((_, i) => i + 1))

  const totalSurrogates = matches.reduce(
    (sum, m) => sum + m.surrogates.length,
    0
  )
  expect(totalSurrogates).toBe((6 - (slots % 6)) % 6)

  for (const match of matches) {
    const ids = [...match.red, ...match.blue]
    expect(new Set(ids).size).toBe(6) // no team twice in a match
  }

  const counts = appearanceCounts(matches)
  for (const teamId of teams) {
    expect(counts.get(teamId)?.real ?? 0).toBe(rounds) // every team plays exactly `rounds` real matches
    expect(counts.get(teamId)?.surrogate ?? 0).toBeLessThanOrEqual(1)
  }
}

describe("matchmaker", () => {
  for (const [teams, rounds] of [
    [9, 4], // 36 slots — exact fit
    [15, 3], // 45 slots — 3 surrogates
    [24, 3], // 72 slots — exact fit
  ] as const) {
    it(`builds a valid schedule for ${teams} teams x ${rounds} rounds`, () => {
      const ids = teamIds(teams)
      const matches = generateQualSchedule(ids, {
        roundsPerTeam: rounds,
        random: seededRandom(42),
      })
      assertValidSchedule(ids, rounds, matches)
    })
  }

  it("avoids back-to-back matches when capacity allows", () => {
    const matches = generateQualSchedule(teamIds(24), {
      roundsPerTeam: 3,
      random: seededRandom(7),
    })
    let backToBacks = 0
    for (let i = 1; i < matches.length; i++) {
      const prev = new Set([...matches[i - 1].red, ...matches[i - 1].blue])
      for (const id of [...matches[i].red, ...matches[i].blue])
        if (prev.has(id)) backToBacks++
    }
    // 24 teams, 6 per match: plenty of room — optimizer should fully eliminate repeats
    expect(backToBacks).toBe(0)
  })

  it("keeps partner repeats low", () => {
    const matches = generateQualSchedule(teamIds(15), {
      roundsPerTeam: 3,
      random: seededRandom(3),
    })
    const partners = new Map<string, number>()
    for (const match of matches) {
      for (const alliance of [match.red, match.blue]) {
        for (let i = 0; i < 3; i++) {
          for (let j = i + 1; j < 3; j++) {
            const key = [alliance[i], alliance[j]].sort().join("|")
            partners.set(key, (partners.get(key) ?? 0) + 1)
          }
        }
      }
    }
    const worst = Math.max(...partners.values())
    expect(worst).toBeLessThanOrEqual(2)
  })

  it("rejects fewer than six teams and duplicate ids", () => {
    expect(() =>
      generateQualSchedule(teamIds(5), { roundsPerTeam: 3 })
    ).toThrow()
    expect(() =>
      generateQualSchedule(["a", "a", "b", "c", "d", "e"], { roundsPerTeam: 1 })
    ).toThrow()
  })
})
