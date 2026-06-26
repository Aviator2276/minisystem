/**
 * Where a playoff match's winner and loser go next, derived from the bracket's
 * `winner:SLOT` / `loser:SLOT` source graph. A match's winner advances to the
 * match that consumes `winner:<thisSlot>`; its loser drops to whoever consumes
 * `loser:<thisSlot>`. If nothing consumes the loser, losing this match
 * eliminates that alliance — i.e. it's an elimination match.
 *
 * Best-of-3 grand-final games (slots F1/F2/F3) are a series, so a single game
 * loss isn't an elimination; those are flagged `isSeriesGame` and never reported
 * as elimination matches here (series state is handled by the caller).
 */

export interface BracketMatchLite {
  bracketSlot: string | null
  redSource: string | null
  blueSource: string | null
  /** "upper" | "lower" | "final" */
  bracket: string
  number: number
}

export interface ProgressionDest {
  slot: string
  bracket: string
  number: number
  /** audience label, e.g. "Lower bracket match 7" or "the Grand Final" */
  label: string
}

export interface MatchProgression {
  isFinal: boolean
  isSeriesGame: boolean
  /** the losing alliance is out of the tournament if they lose this match */
  isElimination: boolean
  /** where the winner plays next; null if there's no further match */
  winner: ProgressionDest | null
  /** where the loser drops to; null means the loser is eliminated */
  loser: ProgressionDest | null
}

function destLabel(match: BracketMatchLite): string {
  if (match.bracket === "final") {
    const series = /^F([123])$/.exec(match.bracketSlot ?? "")
    return series ? `Final ${series[1]}` : "the Grand Final"
  }
  const name = match.bracket.charAt(0).toUpperCase() + match.bracket.slice(1)
  return `${name} bracket match ${match.number}`
}

function destOf(match: BracketMatchLite): ProgressionDest {
  return {
    slot: match.bracketSlot ?? "",
    bracket: match.bracket,
    number: match.number,
    label: destLabel(match),
  }
}

export function matchProgression(
  matches: BracketMatchLite[],
  slot: string | null | undefined
): MatchProgression | null {
  if (!slot) return null
  const consumerOf = (kind: "winner" | "loser"): ProgressionDest | null => {
    const token = `${kind}:${slot}`
    const match = matches.find(
      (m) => m.redSource === token || m.blueSource === token
    )
    return match ? destOf(match) : null
  }

  const winner = consumerOf("winner")
  const loser = consumerOf("loser")
  const isSeriesGame = /^F[123]$/.test(slot)
  const isFinal = slot === "F" || isSeriesGame
  return {
    isFinal,
    isSeriesGame,
    // a series game (best-of-3) is never a single-game elimination
    isElimination: loser === null && !isSeriesGame,
    winner,
    loser,
  }
}
