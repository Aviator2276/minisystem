import { describe, expect, it } from "vitest"
import { cardStateFrom, effectiveReds } from "./cards"

describe("card escalation math", () => {
  it("counts each pair of yellows as one red", () => {
    expect(effectiveReds(0, 0)).toBe(0)
    expect(effectiveReds(1, 0)).toBe(0)
    expect(effectiveReds(2, 0)).toBe(1)
    expect(effectiveReds(3, 0)).toBe(1)
    expect(effectiveReds(4, 0)).toBe(2)
  })

  it("adds explicit reds on top of yellow pairs", () => {
    expect(effectiveReds(0, 1)).toBe(1)
    expect(effectiveReds(2, 1)).toBe(2)
    expect(effectiveReds(0, 2)).toBe(2)
  })

  it("disqualifies at two effective reds", () => {
    expect(cardStateFrom(0, 0).disqualified).toBe(false)
    expect(cardStateFrom(1, 0).disqualified).toBe(false)
    expect(cardStateFrom(2, 0).disqualified).toBe(false) // one effective red
    expect(cardStateFrom(0, 1).disqualified).toBe(false)
    expect(cardStateFrom(2, 1).disqualified).toBe(true) // yellow pair + red
    expect(cardStateFrom(4, 0).disqualified).toBe(true) // two yellow pairs
    expect(cardStateFrom(0, 2).disqualified).toBe(true) // two reds
  })

  it("keeps raw yellow/red counts for the graphic", () => {
    const state = cardStateFrom(3, 1)
    expect(state.yellows).toBe(3)
    expect(state.reds).toBe(1)
    expect(state.effectiveReds).toBe(2)
    expect(state.disqualified).toBe(true)
  })
})
