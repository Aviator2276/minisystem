import type { z } from "zod"
import type {
  GameScoreEvent,
  MatchType,
  ScoreTotals,
} from "@/shared/score-types"

export type GamePhaseId = "auto" | "teleop" | "endgame"

export interface GamePhase {
  id: GamePhaseId
  /** offset from match start */
  startMs: number
  endMs: number
  /** sound cue id played at phase start */
  sound?: string
}

export interface ScoreEventTypeDef {
  /** zod schema for the event payload; drives the judge UI */
  payload: z.ZodType
  label: string
  /** phases during which the judge UI offers this event */
  phases: GamePhaseId[]
  /** per-robot / per-defense buttons in the judge layout */
  target?: "robot" | "defense"
}

export interface RankingInput {
  rp: number
  matchesPlayed: number
  /** tiebreak aggregates, in comparator order */
  autoPoints: number
  endgamePoints: number
  boulders: number
}

export interface GameDefinition<TScore> {
  id: string
  name: string
  phases: GamePhase[]
  matchLengthMs: number
  /** cue id -> public asset path */
  sounds: Record<string, string>
  scoreEventTypes: Record<string, ScoreEventTypeDef>
  initialScore: () => TScore
  /** pure; aggregates are recomputed by replaying non-undone events */
  reduce: (score: TScore, event: GameScoreEvent) => TScore
  computeTotals: (
    own: TScore,
    opponent: TScore,
    matchType: MatchType
  ) => ScoreTotals
  /** ranking points for a played match (excludes surrogates upstream) */
  computeRP: (ownTotal: number, opponentTotal: number) => number
  /** sort comparator over per-team aggregates; positive = b ranks above a */
  compareRankings: (a: RankingInput, b: RankingInput) => number
}
