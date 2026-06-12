/**
 * Pure card/disqualification math, shared by the server (issuing, scoring,
 * selection) and the client (graphics, grey-out). Cards are per event.
 *
 * Rules: two yellow cards count as a red card, and two (effective) reds
 * disqualify a team. Yellows are still tracked and shown individually — the
 * escalation only affects the disqualification count, not the graphic.
 */
export type CardType = "yellow" | "red"

/** effective reds needed to disqualify a team */
export const DQ_THRESHOLD = 2

export interface TeamCardState {
  yellows: number
  reds: number
  /** reds, counting each pair of yellows as one red */
  effectiveReds: number
  disqualified: boolean
}

export function effectiveReds(yellows: number, reds: number): number {
  return reds + Math.floor(yellows / 2)
}

export function cardStateFrom(yellows: number, reds: number): TeamCardState {
  const eff = effectiveReds(yellows, reds)
  return {
    yellows,
    reds,
    effectiveReds: eff,
    disqualified: eff >= DQ_THRESHOLD,
  }
}

export const EMPTY_CARD_STATE: TeamCardState = {
  yellows: 0,
  reds: 0,
  effectiveReds: 0,
  disqualified: false,
}
