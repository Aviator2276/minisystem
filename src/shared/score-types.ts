import type { AllianceColor, MatchType } from "@/db/schema"

export interface GameScoreEvent {
  type: string
  alliance: AllianceColor
  payload: Record<string, unknown>
  matchTimeMs: number
}

export interface ScoreTotals {
  auto: number
  teleop: number
  endgame: number
  /** points credited to this alliance from fouls committed by the opponent */
  penalty: number
  /** playoff-only breach/capture bonus points */
  bonus: number
  total: number
  breach: boolean
  capture: boolean
  boulders: number
}

/**
 * Game-agnostic manual score adjustment event type. A score event of this type
 * carries a signed `{ points }` payload that is folded onto the alliance's
 * computed total outside the per-game reducer (see services/scoring.ts).
 */
export const MANUAL_ADJUST_TYPE = "MANUAL_ADJUST"

export type { AllianceColor, MatchType }

export function opponentOf(alliance: AllianceColor): AllianceColor {
  return alliance === "red" ? "blue" : "red"
}
