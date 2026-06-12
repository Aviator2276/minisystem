import {
  clearKey,
  increment,
  retryAfterSeconds,
  underLimit,
} from "@/server/rate-limit/core"
import type { RateLimitDecision } from "@/server/rate-limit/core"

/**
 * Fixed-window rate limiter for login attempts (backed by the shared store
 * in `@/server/rate-limit/core`). Two buckets are tracked per attempt:
 *  - per IP+account (strict): slows brute-forcing a single account, but is
 *    keyed by IP too so an attacker can't lock a real user out from afar.
 *  - per IP (generous): catches one host spraying many usernames. Kept loose
 *    because a whole venue often shares one NAT'd IP at an event.
 *
 * Only failed attempts count; a successful login clears the account bucket.
 */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000
const PER_ACCOUNT_MAX = 5
const PER_IP_MAX = 50

export type { RateLimitDecision }

const ipKey = (ip: string) => `login:ip:${ip}`
const acctKey = (ip: string, username: string) =>
  `login:acct:${ip}:${username.toLowerCase()}`

/** check before verifying credentials — does not record the attempt */
export function checkLoginRateLimit(
  ip: string,
  username: string
): RateLimitDecision {
  const now = Date.now()
  const keys = [ipKey(ip), acctKey(ip, username)]
  const allowed =
    underLimit(keys[0], PER_IP_MAX, now) &&
    underLimit(keys[1], PER_ACCOUNT_MAX, now)
  return {
    blocked: !allowed,
    retryAfterSeconds: allowed ? 0 : retryAfterSeconds(keys, now),
  }
}

/** count a failed login against both the IP and the account */
export function recordLoginFailure(ip: string, username: string): void {
  const now = Date.now()
  increment(ipKey(ip), LOGIN_WINDOW_MS, now)
  increment(acctKey(ip, username), LOGIN_WINDOW_MS, now)
}

/** clear the per-account counter after a successful login */
export function clearLoginFailures(ip: string, username: string): void {
  clearKey(acctKey(ip, username))
}
