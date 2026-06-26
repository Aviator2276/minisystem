/**
 * Per-team performance metrics derived from posted-match alliance lines.
 *
 * Scores in this game are recorded per *alliance*, not per robot, so isolating a
 * single team's contribution takes a little linear algebra. We compute an
 * Offensive Power Rating (OPR) via least squares — solving
 * `Score(alliance) ≈ OPR_a + OPR_b + OPR_c` across every match — and use that
 * OPR baseline to estimate how much each team suppresses opponents on defense.
 *
 * The simpler leaderboards (crossing / boulders / auto) are plain per-team
 * averages of their alliance's value, which is what the public asked for.
 */

export interface AllianceLine {
  /** non-null team ids on this alliance (usually 3) */
  teams: string[]
  total: number
  auto: number
  boulders: number
  crosses: number
}

export interface MatchLine {
  red: AllianceLine
  blue: AllianceLine
}

export interface TeamMetric {
  teamId: string
  value: number
  matches: number
}

const byValueDesc = (a: TeamMetric, b: TeamMetric) =>
  b.value - a.value || a.teamId.localeCompare(b.teamId)

/** average of an alliance-level value attributed to every team on that alliance */
export function averageBy(
  matches: MatchLine[],
  pick: (line: AllianceLine) => number
): TeamMetric[] {
  const sum = new Map<string, number>()
  const count = new Map<string, number>()
  for (const m of matches) {
    for (const side of [m.red, m.blue]) {
      const value = pick(side)
      for (const t of side.teams) {
        sum.set(t, (sum.get(t) ?? 0) + value)
        count.set(t, (count.get(t) ?? 0) + 1)
      }
    }
  }
  const out: TeamMetric[] = []
  for (const [teamId, c] of count) {
    out.push({ teamId, value: (sum.get(teamId) ?? 0) / c, matches: c })
  }
  return out.sort(byValueDesc)
}

/** all distinct team ids appearing in the match set, in first-seen order */
function rosterOf(matches: MatchLine[]): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const m of matches) {
    for (const t of [...m.red.teams, ...m.blue.teams]) {
      if (!seen.has(t)) {
        seen.add(t)
        order.push(t)
      }
    }
  }
  return order
}

/**
 * Offensive Power Rating per team. Builds the least-squares normal equations
 * `AᵀA x = Aᵀb` (A = alliance/team incidence, b = alliance totals) and solves
 * them. A tiny ridge term keeps the system solvable while an event is still
 * under-determined (few matches relative to teams).
 */
export function computeOPR(matches: MatchLine[]): Map<string, number> {
  const teams = rosterOf(matches)
  const n = teams.length
  const idx = new Map(teams.map((t, i) => [t, i]))
  if (n === 0) return new Map()

  const ata = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const atb = new Array<number>(n).fill(0)
  for (const m of matches) {
    for (const side of [m.red, m.blue]) {
      for (const i of side.teams) {
        const ii = idx.get(i)
        if (ii === undefined) continue
        atb[ii] += side.total
        for (const j of side.teams) {
          const jj = idx.get(j)
          if (jj !== undefined) ata[ii][jj] += 1
        }
      }
    }
  }
  // ridge regularization for numerical stability / under-determined systems
  for (let i = 0; i < n; i++) ata[i][i] += 1e-6

  const x = solveLinear(ata, atb)
  return new Map(teams.map((t, i) => [t, x[i]]))
}

/**
 * Defense score per team: how far an opponent alliance falls below the score
 * their combined OPR predicts, while this team is on the field against them.
 *
 *   Suppression = ExpectedOpponentScore − ActualOpponentScore
 *   ExpectedOpponentScore = Σ OPR over the opposing alliance
 *
 * Aggregated as an opponent-strength-weighted mean (suppressing a strong
 * alliance counts more), then penalized by suppression variance so reliable
 * defenders beat lucky one-offs. Higher is a better defender.
 */
export function computeDefenseScores(
  matches: MatchLine[],
  opr: Map<string, number>,
  consistencyK = 0.5
): TeamMetric[] {
  const acc = new Map<string, { supp: number[]; weight: number[] }>()
  const record = (defenders: string[], suppression: number, weight: number) => {
    for (const t of defenders) {
      const e = acc.get(t) ?? { supp: [], weight: [] }
      e.supp.push(suppression)
      e.weight.push(weight)
      acc.set(t, e)
    }
  }

  for (const m of matches) {
    for (const [defender, opponent] of [
      [m.red, m.blue],
      [m.blue, m.red],
    ] as const) {
      const expected = opponent.teams.reduce((s, t) => s + (opr.get(t) ?? 0), 0)
      record(defender.teams, expected - opponent.total, Math.max(0, expected))
    }
  }

  const out: TeamMetric[] = []
  for (const [teamId, { supp, weight }] of acc) {
    const weightSum = weight.reduce((s, w) => s + w, 0)
    const weighted =
      weightSum > 0
        ? supp.reduce((s, v, i) => s + v * weight[i], 0) / weightSum
        : mean(supp)
    out.push({
      teamId,
      value: weighted - consistencyK * stdDev(supp),
      matches: supp.length,
    })
  }
  return out.sort(byValueDesc)
}

export interface AdvancedStats {
  crossing: TeamMetric[]
  boulders: TeamMetric[]
  auto: TeamMetric[]
  defense: TeamMetric[]
}

export function computeAdvancedStats(matches: MatchLine[]): AdvancedStats {
  const opr = computeOPR(matches)
  return {
    crossing: averageBy(matches, (s) => s.crosses),
    boulders: averageBy(matches, (s) => s.boulders),
    auto: averageBy(matches, (s) => s.auto),
    defense: computeDefenseScores(matches, opr),
  }
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const variance = xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length
  return Math.sqrt(variance)
}

/**
 * Solve `A x = b` for a square, (near-)symmetric positive-definite system via
 * Gaussian elimination with partial pivoting. A negligible pivot means that
 * variable is unconstrained, so it resolves to 0 rather than producing NaNs.
 */
function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length
  // work on copies so callers keep their matrices
  const m = a.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    }
    if (Math.abs(m[pivot][col]) < 1e-9) continue
    ;[m[col], m[pivot]] = [m[pivot], m[col]]

    const diag = m[col][col]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = m[r][col] / diag
      if (factor === 0) continue
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c]
    }
  }

  const x = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) {
    if (Math.abs(m[i][i]) >= 1e-9) x[i] = m[i][n] / m[i][i]
  }
  return x
}
