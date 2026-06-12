import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { consume } from "./core"

// unique keys per test so the process-wide singleton map doesn't leak state
let counter = 0
const freshKey = () => `test:${counter++}`

const WINDOW_MS = 60 * 1000

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("fixed-window consume", () => {
  it("allows requests under the limit", () => {
    const key = freshKey()
    for (let i = 0; i < 5; i++) {
      expect(consume(key, 5, WINDOW_MS).blocked).toBe(false)
    }
  })

  it("blocks once the limit is reached and reports a retry delay", () => {
    const key = freshKey()
    for (let i = 0; i < 3; i++) consume(key, 3, WINDOW_MS)
    const decision = consume(key, 3, WINDOW_MS)
    expect(decision.blocked).toBe(true)
    expect(decision.retryAfterSeconds).toBeGreaterThan(0)
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it("blocked requests do not extend the window", () => {
    const key = freshKey()
    for (let i = 0; i < 3; i++) consume(key, 3, WINDOW_MS)
    vi.advanceTimersByTime(WINDOW_MS / 2)
    expect(consume(key, 3, WINDOW_MS).blocked).toBe(true)
    vi.advanceTimersByTime(WINDOW_MS / 2 + 1)
    expect(consume(key, 3, WINDOW_MS).blocked).toBe(false)
  })

  it("tracks separate keys independently", () => {
    const a = freshKey()
    const b = freshKey()
    for (let i = 0; i < 3; i++) consume(a, 3, WINDOW_MS)
    expect(consume(a, 3, WINDOW_MS).blocked).toBe(true)
    expect(consume(b, 3, WINDOW_MS).blocked).toBe(false)
  })

  it("resets after the window elapses", () => {
    const key = freshKey()
    for (let i = 0; i < 3; i++) consume(key, 3, WINDOW_MS)
    expect(consume(key, 3, WINDOW_MS).blocked).toBe(true)
    vi.advanceTimersByTime(WINDOW_MS + 1)
    expect(consume(key, 3, WINDOW_MS).blocked).toBe(false)
  })
})
