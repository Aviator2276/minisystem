import { z } from "zod"
import type { GameDefinition, RankingInput } from "@/games/types"
import type {
  GameScoreEvent,
  MatchType,
  ScoreTotals,
} from "@/shared/score-types"

// Point values ported from Custom-MiniFRC-FMS src/renderer/match.js
export const PointValues = {
  REACH: 2,
  AUTO_CROSS: 10,
  AUTO_LOW_GOAL: 5,
  AUTO_HIGH_GOAL: 10,
  CROSS: 5,
  LOW_GOAL: 2,
  HIGH_GOAL: 5,
  CHALLENGE: 5,
  SCALE: 15,
  PLAYOFF_BREACH: 20,
  PLAYOFF_CAPTURE: 25,
  FOUL: 5,
  TECH_FOUL: 5,
} as const

export const TOWER_STRENGTH = 6
export const DEFENSE_STRENGTH = 2
export const DEFENSES = 5
export const BREACH_THRESHOLD = 4

export type RobotAuto = "none" | "reach" | "cross"
export type RobotEndgame = "none" | "challenge" | "scale"

export interface StrongholdScore {
  robots: Array<{ auto: RobotAuto; endgame: RobotEndgame }>
  /** remaining strength of each opposing defense this alliance attacks */
  defenses: number[]
  crossings: { auto: number; teleop: number }
  boulders: {
    autoLow: number
    autoHigh: number
    teleLow: number
    teleHigh: number
  }
  /** fouls committed BY this alliance; points credit the opponent */
  fouls: number
  techFouls: number
}

const robotPayload = z.object({ robotIndex: z.number().int().min(0).max(2) })
const crossPayload = z.object({
  robotIndex: z.number().int().min(0).max(2).optional(),
  // optional so an auto cross can be recorded per-robot without naming a
  // defense; teleop crosses always carry the defense they damage
  defenseIndex: z.number().int().min(0).max(4).optional(),
})
const emptyPayload = z.object({})

function initialScore(): StrongholdScore {
  return {
    robots: [
      { auto: "none", endgame: "none" },
      { auto: "none", endgame: "none" },
      { auto: "none", endgame: "none" },
    ],
    defenses: Array.from({ length: DEFENSES }, () => DEFENSE_STRENGTH),
    crossings: { auto: 0, teleop: 0 },
    boulders: { autoLow: 0, autoHigh: 0, teleLow: 0, teleHigh: 0 },
    fouls: 0,
    techFouls: 0,
  }
}

function reduce(
  score: StrongholdScore,
  event: GameScoreEvent
): StrongholdScore {
  const next: StrongholdScore = structuredClone(score)
  const payload = event.payload as {
    robotIndex?: number
    defenseIndex?: number
  }

  switch (event.type) {
    case "REACH": {
      const robot = next.robots[payload.robotIndex ?? 0]
      // reach/cross is a toggle: switching off a cross frees its auto-cross count
      if (robot.auto === "cross")
        next.crossings.auto = Math.max(0, next.crossings.auto - 1)
      robot.auto = "reach"
      break
    }
    case "AUTO_CROSS": {
      if (payload.robotIndex !== undefined) {
        const robot = next.robots[payload.robotIndex]
        // only count a genuinely new cross, so reach<->cross toggles stay exact
        if (robot.auto !== "cross") next.crossings.auto += 1
        robot.auto = "cross"
      } else {
        next.crossings.auto += 1
      }
      damage(next, payload.defenseIndex)
      break
    }
    case "CROSS": {
      next.crossings.teleop += 1
      damage(next, payload.defenseIndex)
      break
    }
    case "AUTO_LOW_GOAL":
      next.boulders.autoLow += 1
      break
    case "AUTO_HIGH_GOAL":
      next.boulders.autoHigh += 1
      break
    case "LOW_GOAL":
      next.boulders.teleLow += 1
      break
    case "HIGH_GOAL":
      next.boulders.teleHigh += 1
      break
    case "CHALLENGE":
      next.robots[payload.robotIndex ?? 0].endgame = "challenge"
      break
    case "SCALE":
      next.robots[payload.robotIndex ?? 0].endgame = "scale"
      break
    // lets the endgame selector return a robot to "nothing" (last write wins)
    case "ENDGAME_CLEAR":
      next.robots[payload.robotIndex ?? 0].endgame = "none"
      break
    case "FOUL":
      next.fouls += 1
      break
    case "TECH_FOUL":
      next.techFouls += 1
      break
  }
  return next
}

function damage(score: StrongholdScore, defenseIndex: number | undefined) {
  if (defenseIndex === undefined) return
  score.defenses[defenseIndex] = Math.max(0, score.defenses[defenseIndex] - 1)
}

export function boulderCount(score: StrongholdScore): number {
  const b = score.boulders
  return b.autoLow + b.autoHigh + b.teleLow + b.teleHigh
}

export function breached(score: StrongholdScore): boolean {
  return score.defenses.filter((s) => s === 0).length >= BREACH_THRESHOLD
}

/** strength of the tower this alliance attacks; own tech fouls repair it */
export function opponentTowerStrength(score: StrongholdScore): number {
  return TOWER_STRENGTH - boulderCount(score) + score.techFouls
}

export function captured(score: StrongholdScore): boolean {
  return (
    opponentTowerStrength(score) <= 0 &&
    score.robots.every((r) => r.endgame !== "none")
  )
}

function computeTotals(
  own: StrongholdScore,
  opponent: StrongholdScore,
  matchType: MatchType
): ScoreTotals {
  const reaches = own.robots.filter((r) => r.auto === "reach").length
  const auto =
    reaches * PointValues.REACH +
    own.crossings.auto * PointValues.AUTO_CROSS +
    own.boulders.autoLow * PointValues.AUTO_LOW_GOAL +
    own.boulders.autoHigh * PointValues.AUTO_HIGH_GOAL

  const teleop =
    own.crossings.teleop * PointValues.CROSS +
    own.boulders.teleLow * PointValues.LOW_GOAL +
    own.boulders.teleHigh * PointValues.HIGH_GOAL

  const endgame = own.robots.reduce(
    (sum, r) =>
      sum +
      (r.endgame === "challenge"
        ? PointValues.CHALLENGE
        : r.endgame === "scale"
          ? PointValues.SCALE
          : 0),
    0
  )

  // fouls committed by the opponent credit this alliance (fixes inverted colors in the source FMS)
  const penalty =
    opponent.fouls * PointValues.FOUL +
    opponent.techFouls * PointValues.TECH_FOUL

  const isBreach = breached(own)
  const isCapture = captured(own)
  const bonus =
    matchType === "playoff"
      ? (isBreach ? PointValues.PLAYOFF_BREACH : 0) +
        (isCapture ? PointValues.PLAYOFF_CAPTURE : 0)
      : 0

  return {
    auto,
    teleop,
    endgame,
    penalty,
    bonus,
    total: auto + teleop + endgame + penalty + bonus,
    breach: isBreach,
    capture: isCapture,
    boulders: boulderCount(own),
  }
}

function computeRP(ownTotal: number, opponentTotal: number): number {
  if (ownTotal > opponentTotal) return 2
  if (ownTotal === opponentTotal) return 1
  return 0
}

function compareRankings(a: RankingInput, b: RankingInput): number {
  const avg = (r: RankingInput, value: number) =>
    r.matchesPlayed === 0 ? 0 : value / r.matchesPlayed
  return (
    avg(b, b.rp) - avg(a, a.rp) ||
    avg(b, b.autoPoints) - avg(a, a.autoPoints) ||
    avg(b, b.endgamePoints) - avg(a, a.endgamePoints) ||
    avg(b, b.boulders) - avg(a, a.boulders)
  )
}

export const stronghold: GameDefinition<StrongholdScore> = {
  id: "stronghold2016",
  name: "FIRST Stronghold",
  matchLengthMs: 153_500,
  // Scoring windows the judge groups buttons by (see timeline for the clock).
  phases: [
    { id: "auto", startMs: 0, endMs: 15_000 },
    { id: "teleop", startMs: 15_000, endMs: 120_000 },
    { id: "endgame", startMs: 120_000, endMs: 150_000 },
  ],
  // Clock/sound timeline. Endgame is folded into one continuous teleop segment
  // so the display timer never resets; the endgame buzzer fires as a cue 30s
  // before teleop ends. A short pause after auto holds for the buzzer's length.
  timeline: [
    { id: "auto", startMs: 0, endMs: 15_000, sound: "match-start" },
    { id: "pause", startMs: 15_000, endMs: 18_500, sound: "match-end" },
    {
      id: "teleop",
      startMs: 18_500,
      endMs: 153_500,
      sound: "teleop-start",
      cues: [{ atMs: 123_500, sound: "endgame-start" }],
    },
  ],
  sounds: {
    "match-start": "/sounds/match-start.wav",
    "teleop-start": "/sounds/teleop-start.wav",
    "endgame-start": "/sounds/endgame-start.wav",
    "match-end": "/sounds/match-end.wav",
    "field-fault": "/sounds/field-fault.wav",
    results: "/sounds/results.wav",
  },
  scoreEventTypes: {
    REACH: {
      payload: robotPayload,
      label: "Reach",
      phases: ["auto"],
      target: "robot",
    },
    AUTO_CROSS: {
      payload: crossPayload,
      label: "Auto Cross",
      phases: ["auto"],
      target: "defense",
    },
    AUTO_LOW_GOAL: {
      payload: emptyPayload,
      label: "Auto Low Goal",
      phases: ["auto"],
    },
    AUTO_HIGH_GOAL: {
      payload: emptyPayload,
      label: "Auto High Goal",
      phases: ["auto"],
    },
    CROSS: {
      payload: crossPayload,
      label: "Cross",
      phases: ["teleop", "endgame"],
      target: "defense",
    },
    LOW_GOAL: {
      payload: emptyPayload,
      label: "Low Goal",
      phases: ["teleop", "endgame"],
    },
    HIGH_GOAL: {
      payload: emptyPayload,
      label: "High Goal",
      phases: ["teleop", "endgame"],
    },
    CHALLENGE: {
      payload: robotPayload,
      label: "Challenge",
      phases: ["endgame"],
      target: "robot",
    },
    SCALE: {
      payload: robotPayload,
      label: "Scale",
      phases: ["endgame"],
      target: "robot",
    },
    ENDGAME_CLEAR: {
      payload: robotPayload,
      label: "Clear Endgame",
      phases: ["endgame"],
      target: "robot",
    },
    FOUL: {
      payload: emptyPayload,
      label: "Foul",
      phases: ["auto", "teleop", "endgame"],
    },
    TECH_FOUL: {
      payload: emptyPayload,
      label: "Tech Foul",
      phases: ["auto", "teleop", "endgame"],
    },
  },
  initialScore,
  reduce,
  computeTotals,
  computeRP,
  compareRankings,
}
