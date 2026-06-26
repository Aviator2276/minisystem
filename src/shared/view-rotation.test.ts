import { describe, expect, it } from "vitest"
import {
  nextRotationView,
  rotationSet,
  slideDwellMs,
  ROTATE_SLIDE_MS,
} from "./view-rotation"
import type { RotationContext } from "./view-rotation"

const ctx = (over: Partial<RotationContext> = {}): RotationContext => ({
  alwaysShowLineup: false,
  isPlayoffs: false,
  hasRankings: true,
  hasSchedule: true,
  hasBracket: false,
  ...over,
})

describe("rotationSet", () => {
  it("cycles lineup → rankings → schedule by default", () => {
    expect(rotationSet(ctx())).toEqual(["lineup", "rankings", "schedule"])
  })

  it("drops lineup when the lineup banner is pinned", () => {
    expect(rotationSet(ctx({ alwaysShowLineup: true }))).toEqual([
      "rankings",
      "schedule",
    ])
  })

  it("rotates lineup → schedule → bracket during playoffs (no rankings)", () => {
    expect(rotationSet(ctx({ isPlayoffs: true, hasBracket: true }))).toEqual([
      "lineup",
      "schedule",
      "bracket",
    ])
  })

  it("omits views with no data", () => {
    expect(
      rotationSet(ctx({ hasRankings: false, hasSchedule: false }))
    ).toEqual(["lineup"])
  })
})

describe("nextRotationView", () => {
  const set = ["lineup", "rankings", "schedule"] as const

  it("advances and wraps around", () => {
    expect(nextRotationView([...set], "lineup")).toBe("rankings")
    expect(nextRotationView([...set], "rankings")).toBe("schedule")
    expect(nextRotationView([...set], "schedule")).toBe("lineup")
  })

  it("jumps to the first view when current is outside the set", () => {
    expect(nextRotationView([...set], "match")).toBe("lineup")
    expect(nextRotationView([...set], "camera")).toBe("lineup")
  })

  it("returns null for an empty set", () => {
    expect(nextRotationView([], "rankings")).toBeNull()
  })
})

describe("slideDwellMs", () => {
  it("uses the base slide length for non-rankings views", () => {
    expect(slideDwellMs("schedule", 99)).toBe(ROTATE_SLIDE_MS)
  })

  it("holds rankings long enough to page through every team", () => {
    expect(slideDwellMs("rankings", 8)).toBe(ROTATE_SLIDE_MS) // 1 page
    expect(slideDwellMs("rankings", 10)).toBe(ROTATE_SLIDE_MS) // exactly 1 page
    expect(slideDwellMs("rankings", 24)).toBe(3 * ROTATE_SLIDE_MS) // 3 pages
    expect(slideDwellMs("rankings", 0)).toBe(ROTATE_SLIDE_MS) // never zero
  })
})
