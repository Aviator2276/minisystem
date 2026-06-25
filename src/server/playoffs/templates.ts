/**
 * Hand-built double-elimination bracket templates per alliance count.
 *
 * There is no canonical double-elim layout for counts other than 8 (the FRC
 * 2023+ bracket), so 3-7 are designed here and locked in by unit tests. Every
 * alliance must lose twice to be eliminated; the grand final is a single
 * match between the upper- and lower-bracket winners (no bracket reset, by
 * design — MiniFRC events are short).
 *
 * The grand final flips alliance colors relative to the rest of the bracket:
 * the lower-bracket finalist is red and the upper-bracket finalist is blue.
 *
 * Sources: 'seed:N' (alliance seeded N), 'winner:SLOT', 'loser:SLOT'.
 */

export type Bracket = "upper" | "lower" | "final"

export interface TemplateMatch {
  slot: string
  bracket: Bracket
  round: number
  red: string
  blue: string
}

const T8: TemplateMatch[] = [
  { slot: "M1", bracket: "upper", round: 1, red: "seed:1", blue: "seed:8" },
  { slot: "M2", bracket: "upper", round: 1, red: "seed:4", blue: "seed:5" },
  { slot: "M3", bracket: "upper", round: 1, red: "seed:2", blue: "seed:7" },
  { slot: "M4", bracket: "upper", round: 1, red: "seed:3", blue: "seed:6" },
  { slot: "M5", bracket: "lower", round: 2, red: "loser:M1", blue: "loser:M2" },
  { slot: "M6", bracket: "lower", round: 2, red: "loser:M3", blue: "loser:M4" },
  {
    slot: "M7",
    bracket: "upper",
    round: 2,
    red: "winner:M1",
    blue: "winner:M2",
  },
  {
    slot: "M8",
    bracket: "upper",
    round: 2,
    red: "winner:M3",
    blue: "winner:M4",
  },
  // cross the brackets to avoid immediate rematches
  {
    slot: "M9",
    bracket: "lower",
    round: 3,
    red: "winner:M5",
    blue: "loser:M8",
  },
  {
    slot: "M10",
    bracket: "lower",
    round: 3,
    red: "winner:M6",
    blue: "loser:M7",
  },
  {
    slot: "M11",
    bracket: "upper",
    round: 3,
    red: "winner:M7",
    blue: "winner:M8",
  },
  {
    slot: "M12",
    bracket: "lower",
    round: 4,
    red: "winner:M9",
    blue: "winner:M10",
  },
  {
    slot: "M13",
    bracket: "lower",
    round: 5,
    red: "loser:M11",
    blue: "winner:M12",
  },
  // finals switch colors: lower-bracket finalist red, upper-bracket finalist blue
  {
    slot: "F",
    bracket: "final",
    round: 6,
    red: "winner:M13",
    blue: "winner:M11",
  },
]

const T7: TemplateMatch[] = [
  { slot: "M1", bracket: "upper", round: 1, red: "seed:2", blue: "seed:7" },
  { slot: "M2", bracket: "upper", round: 1, red: "seed:3", blue: "seed:6" },
  { slot: "M3", bracket: "upper", round: 1, red: "seed:4", blue: "seed:5" },
  { slot: "M4", bracket: "upper", round: 2, red: "seed:1", blue: "winner:M3" },
  {
    slot: "M5",
    bracket: "upper",
    round: 2,
    red: "winner:M1",
    blue: "winner:M2",
  },
  { slot: "M6", bracket: "lower", round: 2, red: "loser:M2", blue: "loser:M3" },
  {
    slot: "M7",
    bracket: "lower",
    round: 3,
    red: "loser:M1",
    blue: "winner:M6",
  },
  {
    slot: "M8",
    bracket: "upper",
    round: 3,
    red: "winner:M4",
    blue: "winner:M5",
  },
  { slot: "M9", bracket: "lower", round: 3, red: "loser:M4", blue: "loser:M5" },
  {
    slot: "M10",
    bracket: "lower",
    round: 4,
    red: "winner:M7",
    blue: "winner:M9",
  },
  {
    slot: "M11",
    bracket: "lower",
    round: 5,
    red: "loser:M8",
    blue: "winner:M10",
  },
  {
    slot: "F",
    bracket: "final",
    round: 6,
    red: "winner:M11",
    blue: "winner:M8",
  },
]

const T6: TemplateMatch[] = [
  { slot: "M1", bracket: "upper", round: 1, red: "seed:3", blue: "seed:6" },
  { slot: "M2", bracket: "upper", round: 1, red: "seed:4", blue: "seed:5" },
  { slot: "M3", bracket: "upper", round: 2, red: "seed:1", blue: "winner:M2" },
  { slot: "M4", bracket: "upper", round: 2, red: "seed:2", blue: "winner:M1" },
  { slot: "M5", bracket: "lower", round: 2, red: "loser:M1", blue: "loser:M2" },
  {
    slot: "M6",
    bracket: "lower",
    round: 3,
    red: "loser:M4",
    blue: "winner:M5",
  },
  {
    slot: "M7",
    bracket: "upper",
    round: 3,
    red: "winner:M3",
    blue: "winner:M4",
  },
  {
    slot: "M8",
    bracket: "lower",
    round: 4,
    red: "loser:M3",
    blue: "winner:M6",
  },
  {
    slot: "M9",
    bracket: "lower",
    round: 5,
    red: "loser:M7",
    blue: "winner:M8",
  },
  {
    slot: "F",
    bracket: "final",
    round: 6,
    red: "winner:M9",
    blue: "winner:M7",
  },
]

const T5: TemplateMatch[] = [
  { slot: "M1", bracket: "upper", round: 1, red: "seed:4", blue: "seed:5" },
  { slot: "M2", bracket: "upper", round: 2, red: "seed:1", blue: "winner:M1" },
  { slot: "M3", bracket: "upper", round: 2, red: "seed:2", blue: "seed:3" },
  { slot: "M4", bracket: "lower", round: 2, red: "loser:M1", blue: "loser:M3" },
  {
    slot: "M5",
    bracket: "upper",
    round: 3,
    red: "winner:M2",
    blue: "winner:M3",
  },
  {
    slot: "M6",
    bracket: "lower",
    round: 3,
    red: "loser:M2",
    blue: "winner:M4",
  },
  {
    slot: "M7",
    bracket: "lower",
    round: 4,
    red: "loser:M5",
    blue: "winner:M6",
  },
  {
    slot: "F",
    bracket: "final",
    round: 5,
    red: "winner:M7",
    blue: "winner:M5",
  },
]

const T4: TemplateMatch[] = [
  { slot: "M1", bracket: "upper", round: 1, red: "seed:1", blue: "seed:4" },
  { slot: "M2", bracket: "upper", round: 1, red: "seed:2", blue: "seed:3" },
  { slot: "M3", bracket: "lower", round: 2, red: "loser:M1", blue: "loser:M2" },
  {
    slot: "M4",
    bracket: "upper",
    round: 2,
    red: "winner:M1",
    blue: "winner:M2",
  },
  {
    slot: "M5",
    bracket: "lower",
    round: 3,
    red: "loser:M4",
    blue: "winner:M3",
  },
  {
    slot: "F",
    bracket: "final",
    round: 4,
    red: "winner:M5",
    blue: "winner:M4",
  },
]

const T3: TemplateMatch[] = [
  { slot: "M1", bracket: "upper", round: 1, red: "seed:2", blue: "seed:3" },
  { slot: "M2", bracket: "upper", round: 2, red: "seed:1", blue: "winner:M1" },
  { slot: "M3", bracket: "lower", round: 3, red: "loser:M2", blue: "loser:M1" },
  {
    slot: "F",
    bracket: "final",
    round: 4,
    red: "winner:M3",
    blue: "winner:M2",
  },
]

const T2: TemplateMatch[] = [
  { slot: "M1", bracket: "upper", round: 1, red: "seed:1", blue: "seed:2" },
  { slot: "F", bracket: "final", round: 2, red: "loser:M1", blue: "winner:M1" },
]

const TEMPLATES: Record<number, TemplateMatch[] | undefined> = {
  2: T2,
  3: T3,
  4: T4,
  5: T5,
  6: T6,
  7: T7,
  8: T8,
}

export function bracketTemplate(allianceCount: number): TemplateMatch[] {
  const template = TEMPLATES[allianceCount]
  if (!template) {
    throw new Error(
      `No bracket template for ${allianceCount} alliances (supported: 2-8)`
    )
  }
  return template
}

/**
 * Expand the single grand final ("F") into a best-of-3 series (F1/F2/F3)
 * between the same two finalists. Game 2 swaps the alliance colors to even out
 * any field advantage; the champion is the first finalist to win two games.
 * Each game gets its own round so the bracket lays them out left-to-right in a
 * row, exactly like the single final with games 2 and 3 trailing to the right.
 */
export function expandFinalsBestOf3(
  template: TemplateMatch[]
): TemplateMatch[] {
  const finalIndex = template.findIndex((m) => m.slot === "F")
  if (finalIndex === -1) return template
  const final = template[finalIndex]
  const series: TemplateMatch[] = [
    { ...final, slot: "F1" },
    {
      ...final,
      slot: "F2",
      round: final.round + 1,
      red: final.blue,
      blue: final.red,
    },
    { ...final, slot: "F3", round: final.round + 2 },
  ]
  return [
    ...template.slice(0, finalIndex),
    ...series,
    ...template.slice(finalIndex + 1),
  ]
}
