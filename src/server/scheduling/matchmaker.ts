// TS replacement for MatchMaker.exe: builds a qualification schedule where no
// team appears twice in a match, partner/opponent repeats and back-to-back
// matches are minimized via randomized swap hill-climbing, and surrogate
// appearances fill the last match when teams*rounds isn't a multiple of 6.

export interface ScheduledQualMatch {
  number: number
  red: [string, string, string]
  blue: [string, string, string]
  surrogates: string[]
}

export interface MatchmakerOptions {
  roundsPerTeam: number
  iterations?: number
  random?: () => number
}

const SLOTS_PER_MATCH = 6

interface Appearance {
  teamId: string
  surrogate: boolean
}

export function generateQualSchedule(
  teamIds: string[],
  options: MatchmakerOptions
): ScheduledQualMatch[] {
  const { roundsPerTeam, iterations = 50_000, random = Math.random } = options
  if (teamIds.length < SLOTS_PER_MATCH) {
    throw new Error(
      `Need at least ${SLOTS_PER_MATCH} teams, got ${teamIds.length}`
    )
  }
  if (new Set(teamIds).size !== teamIds.length)
    throw new Error("Duplicate team ids")

  const appearances: Appearance[] = teamIds.flatMap((teamId) =>
    Array.from({ length: roundsPerTeam }, () => ({ teamId, surrogate: false }))
  )

  // fill the final match with surrogate appearances from distinct random teams
  const remainder = appearances.length % SLOTS_PER_MATCH
  if (remainder !== 0) {
    const fill = SLOTS_PER_MATCH - remainder
    const pool = shuffle([...teamIds], random).slice(0, fill)
    for (const teamId of pool) appearances.push({ teamId, surrogate: true })
  }

  const slots = shuffle(appearances, random)
  let cost = totalCost(slots)

  for (let i = 0; i < iterations && cost > 0; i++) {
    const a = Math.floor(random() * slots.length)
    const b = Math.floor(random() * slots.length)
    if (
      a === b ||
      Math.floor(a / SLOTS_PER_MATCH) === Math.floor(b / SLOTS_PER_MATCH)
    )
      continue
    ;[slots[a], slots[b]] = [slots[b], slots[a]]
    const next = totalCost(slots)
    if (next <= cost) {
      cost = next
    } else {
      ;[slots[a], slots[b]] = [slots[b], slots[a]]
    }
  }

  if (hasDuplicateInMatch(slots)) {
    throw new Error(
      "Matchmaker failed to remove duplicate team from a match; retry with more iterations"
    )
  }

  const matches: ScheduledQualMatch[] = []
  for (let m = 0; m * SLOTS_PER_MATCH < slots.length; m++) {
    const chunk = slots.slice(m * SLOTS_PER_MATCH, (m + 1) * SLOTS_PER_MATCH)
    matches.push({
      number: m + 1,
      red: [chunk[0].teamId, chunk[1].teamId, chunk[2].teamId],
      blue: [chunk[3].teamId, chunk[4].teamId, chunk[5].teamId],
      surrogates: chunk.filter((s) => s.surrogate).map((s) => s.teamId),
    })
  }
  return matches
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

function hasDuplicateInMatch(slots: Appearance[]): boolean {
  for (let m = 0; m * SLOTS_PER_MATCH < slots.length; m++) {
    const ids = slots
      .slice(m * SLOTS_PER_MATCH, (m + 1) * SLOTS_PER_MATCH)
      .map((s) => s.teamId)
    if (new Set(ids).size !== ids.length) return true
  }
  return false
}

const DUPLICATE_PENALTY = 1_000_000
const BACK_TO_BACK_PENALTY = 100
const PARTNER_REPEAT_PENALTY = 10
const OPPONENT_REPEAT_PENALTY = 4

function totalCost(slots: Appearance[]): number {
  let cost = 0
  const partnerPairs = new Map<string, number>()
  const opponentPairs = new Map<string, number>()
  let previous = new Set<string>()

  for (let m = 0; m * SLOTS_PER_MATCH < slots.length; m++) {
    const chunk = slots.slice(m * SLOTS_PER_MATCH, (m + 1) * SLOTS_PER_MATCH)
    const ids = chunk.map((s) => s.teamId)
    cost += (ids.length - new Set(ids).size) * DUPLICATE_PENALTY

    const current = new Set(ids)
    for (const id of current) if (previous.has(id)) cost += BACK_TO_BACK_PENALTY
    previous = current

    const red = ids.slice(0, 3)
    const blue = ids.slice(3, 6)
    for (const alliance of [red, blue]) {
      for (let i = 0; i < alliance.length; i++) {
        for (let j = i + 1; j < alliance.length; j++) {
          cost +=
            bump(partnerPairs, alliance[i], alliance[j]) *
            PARTNER_REPEAT_PENALTY
        }
      }
    }
    for (const r of red)
      for (const b of blue)
        cost += bump(opponentPairs, r, b) * OPPONENT_REPEAT_PENALTY
  }
  return cost
}

/** counts prior meetings of a pair; returns how many times they already met */
function bump(map: Map<string, number>, a: string, b: string): number {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`
  const prior = map.get(key) ?? 0
  map.set(key, prior + 1)
  return prior
}
