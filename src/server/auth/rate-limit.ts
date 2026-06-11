import { getSingleton } from "@/server/engine/registry"

/**
 * In-memory fixed-window rate limiter for login attempts. Two buckets are
 * tracked per attempt:
 *  - per IP+account (strict): slows brute-forcing a single account, but is
 *    keyed by IP too so an attacker can't lock a real user out from afar.
 *  - per IP (generous): catches one host spraying many usernames. Kept loose
 *    because a whole venue often shares one NAT'd IP at an event.
 *
 * Only failed attempts count; a successful login clears the account bucket.
 * State lives on a process-wide singleton so dev-server HMR doesn't reset it.
 */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000
const PER_ACCOUNT_MAX = 5
const PER_IP_MAX = 50
const MAX_TRACKED_KEYS = 10_000

interface Bucket {
  count: number
  resetAt: number
}

function buckets(): Map<string, Bucket> {
  return getSingleton("auth_rate_limit", () => new Map<string, Bucket>())
}

const ipKey = (ip: string) => `ip:${ip}`
const acctKey = (ip: string, username: string) =>
  `acct:${ip}:${username.toLowerCase()}`

/** drop expired entries once the map grows, so it can't leak unboundedly */
function prune(map: Map<string, Bucket>, now: number): void {
  if (map.size < MAX_TRACKED_KEYS) return
  for (const [key, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(key)
  }
}

/** is `key` still under `max` within its window? does not count this attempt */
function underLimit(key: string, max: number, now: number): boolean {
  const bucket = buckets().get(key)
  if (!bucket || bucket.resetAt <= now) return true
  return bucket.count < max
}

function increment(key: string, now: number): void {
  const map = buckets()
  prune(map, now)
  const bucket = map.get(key)
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
  } else {
    bucket.count += 1
  }
}

function retryAfterSeconds(keys: string[], now: number): number {
  let longest = 0
  for (const key of keys) {
    const bucket = buckets().get(key)
    if (bucket && bucket.resetAt > now) {
      longest = Math.max(longest, bucket.resetAt - now)
    }
  }
  return Math.max(1, Math.ceil(longest / 1000))
}

export interface RateLimitDecision {
  blocked: boolean
  retryAfterSeconds: number
}

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
  increment(ipKey(ip), now)
  increment(acctKey(ip, username), now)
}

/** clear the per-account counter after a successful login */
export function clearLoginFailures(ip: string, username: string): void {
  buckets().delete(acctKey(ip, username))
}
