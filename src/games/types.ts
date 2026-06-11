import type { z } from "zod"
import type {
  GameScoreEvent,
  MatchType,
  ScoreTotals,
} from "@/shared/score-types"

export type GamePhaseId = "auto" | "teleop" | "endgame"

/**
 * Scoring taxonomy: the windows the judge UI groups score buttons by. Distinct
 * from the engine {@link TimelineSegment} that drives the clock and sounds.
 */
export interface GamePhase {
  id: GamePhaseId
  /** offset from match start */
  startMs: number
  endMs: number
}

/** A sound played at a sub-segment offset without resetting the clock/phase. */
export interface TimelineCue {
  /** offset from match start at which the cue fires */
  atMs: number
  sound: string
}

/**
 * Engine timeline segment — drives the field clock, phase transitions, sounds,
 * and the display countdown. Distinct from {@link GamePhase}: e.g. Stronghold's
 * endgame is part of one continuous `teleop` segment here, with the endgame
 * warning delivered as a {@link TimelineCue} so the timer never resets.
 */
export interface TimelineSegment {
  /** becomes the broadcast `field.phase` while this segment is active */
  id: string
  /** offset from match start */
  startMs: number
  endMs: number
  /** sound cue id played when the segment begins */
  sound?: string
  /** sounds played mid-segment without changing the phase or clock */
  cues?: TimelineCue[]
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
  /** scoring windows for the judge UI */
  phases: GamePhase[]
  /** engine clock/sound timeline; covers the full match */
  timeline: TimelineSegment[]
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
