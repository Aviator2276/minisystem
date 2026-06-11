import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  LOGIN_WINDOW_MS,
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "./rate-limit"

// each test uses a unique IP so the process-wide singleton map doesn't leak
// state between cases
let counter = 0
const freshIp = () => `10.0.0.${counter++}`

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("login rate limiting", () => {
  it("allows attempts under the per-account limit", () => {
    const ip = freshIp()
    for (let i = 0; i < 5; i++) {
      expect(checkLoginRateLimit(ip, "alice").blocked).toBe(false)
      recordLoginFailure(ip, "alice")
    }
  })

  it("blocks after 5 failed attempts on the same account", () => {
    const ip = freshIp()
    for (let i = 0; i < 5; i++) recordLoginFailure(ip, "alice")
    const decision = checkLoginRateLimit(ip, "alice")
    expect(decision.blocked).toBe(true)
    expect(decision.retryAfterSeconds).toBeGreaterThan(0)
  })

  it("a successful login clears the account counter", () => {
    const ip = freshIp()
    for (let i = 0; i < 5; i++) recordLoginFailure(ip, "alice")
    expect(checkLoginRateLimit(ip, "alice").blocked).toBe(true)
    clearLoginFailures(ip, "alice")
    expect(checkLoginRateLimit(ip, "alice").blocked).toBe(false)
  })

  it("does not lock a second account on the same IP below the IP cap", () => {
    const ip = freshIp()
    for (let i = 0; i < 5; i++) recordLoginFailure(ip, "alice")
    expect(checkLoginRateLimit(ip, "alice").blocked).toBe(true)
    // a different user from the same NAT'd IP is unaffected
    expect(checkLoginRateLimit(ip, "bob").blocked).toBe(false)
  })

  it("blocks an IP spraying many usernames once the IP cap is hit", () => {
    const ip = freshIp()
    for (let i = 0; i < 50; i++) recordLoginFailure(ip, `user${i}`)
    // a brand-new account from that IP is now blocked by the IP bucket
    expect(checkLoginRateLimit(ip, "freshuser").blocked).toBe(true)
  })

  it("resets after the window elapses", () => {
    const ip = freshIp()
    for (let i = 0; i < 5; i++) recordLoginFailure(ip, "alice")
    expect(checkLoginRateLimit(ip, "alice").blocked).toBe(true)
    vi.advanceTimersByTime(LOGIN_WINDOW_MS + 1)
    expect(checkLoginRateLimit(ip, "alice").blocked).toBe(false)
  })

  it("is case-insensitive on the username", () => {
    const ip = freshIp()
    for (let i = 0; i < 5; i++) recordLoginFailure(ip, "Alice")
    expect(checkLoginRateLimit(ip, "alice").blocked).toBe(true)
  })
})
