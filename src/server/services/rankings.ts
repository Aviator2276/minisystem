import { and, eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import { getGame } from "@/games"
import type { RankingInput } from "@/games/types"
import { getEvent, listEventTeams } from "./events"
import type { CachedAllianceScore } from "./scoring"

export interface RankingRow extends RankingInput {
  teamId: string
  number: number
  name: string
  rank: number
  /**
   * Total ranking points = points earned from matches (`rp`: 2/win, 1/tie) plus
   * the manual admin adjustment (`event_teams.rankingPoints`). This is the
   * primary ranking key.
   */
  rankingPoints: number
  wins: number
  losses: number
  ties: number
}

export function computeRankings(db: Db, eventId: string): RankingRow[] {
  const game = getGame(getEvent(db, eventId).gameId)
  const roster = listEventTeams(db, eventId)
  // manual +/- adjustment per team; folded into the total ranking points below
  const manualOf = new Map(roster.map((t) => [t.teamId, t.rankingPoints]))

  const rows = new Map<string, RankingRow>(
    roster.map((t) => [
      t.teamId,
      {
        teamId: t.teamId,
        number: t.number,
        name: t.name,
        rank: 0,
        rankingPoints: 0,
        rp: 0,
        matchesPlayed: 0,
        autoPoints: 0,
        endgamePoints: 0,
        boulders: 0,
        wins: 0,
        losses: 0,
        ties: 0,
      },
    ])
  )

  const posted = db
    .select()
    .from(tables.matches)
    .where(
      and(
        eq(tables.matches.eventId, eventId),
        eq(tables.matches.type, "qualification"),
        eq(tables.matches.status, "posted")
      )
    )
    .all()

  for (const match of posted) {
    const sides = [
      {
        teams: [match.red1, match.red2, match.red3],
        rp: match.redRP ?? 0,
        cache: match.redScore,
        won: match.winner === "red",
      },
      {
        teams: [match.blue1, match.blue2, match.blue3],
        rp: match.blueRP ?? 0,
        cache: match.blueScore,
        won: match.winner === "blue",
      },
    ]
    for (const side of sides) {
      const totals = (side.cache as CachedAllianceScore | null)?.totals
      for (const teamId of side.teams) {
        if (!teamId) continue
        if (match.surrogates.includes(teamId)) continue // surrogate appearances never count
        if (match.disqualifications.includes(teamId)) continue
        const row = rows.get(teamId)
        if (!row) continue
        row.matchesPlayed += 1
        row.rp += side.rp
        if (match.winner === "tie") row.ties += 1
        else if (side.won) row.wins += 1
        else row.losses += 1
        if (totals) {
          row.autoPoints += totals.auto
          row.endgamePoints += totals.endgame
          row.boulders += totals.boulders
        }
      }
    }
  }

  // total ranking points = earned RP + manual adjustment
  for (const row of rows.values()) {
    row.rankingPoints = row.rp + (manualOf.get(row.teamId) ?? 0)
  }

  // rank by total ranking points; the game's computed comparator (avg RP +
  // tiebreakers) settles teams that are level on ranking points
  const sorted = [...rows.values()].sort(
    (a, b) => b.rankingPoints - a.rankingPoints || game.compareRankings(a, b)
  )
  sorted.forEach((row, i) => (row.rank = i + 1))
  return sorted
}
