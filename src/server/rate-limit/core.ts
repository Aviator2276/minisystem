import { getSingleton } from "@/server/engine/registry"

/**
 * Shared in-memory fixed-window counter store backing every rate limiter
 * (login attempts, public reads, websocket opens). Callers namespace their
 * own keys. State lives on a process-wide singleton so dev-server HMR
 * doesn't reset it.
 */
const MAX_TRACKED_KEYS = 10_000

interface Bucket {
  count: number
  resetAt: number
}

export interface RateLimitDecision {
  blocked: boolean
  retryAfterSeconds: number
}

function buckets(): Map<string, Bucket> {
  return getSingleton("rate_limit_buckets", () => new Map<string, Bucket>())
}

/** drop expired entries once the map grows, so it can't leak unboundedly */
function prune(map: Map<string, Bucket>, now: number): void {
  if (map.size < MAX_TRACKED_KEYS) return
  for (const [key, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(key)
  }
}

/** is `key` still under `max` within its window? does not count an attempt */
export function underLimit(key: string, max: number, now: number): boolean {
  const bucket = buckets().get(key)
  if (!bucket || bucket.resetAt <= now) return true
  return bucket.count < max
}

export function increment(key: string, windowMs: number, now: number): void {
  const map = buckets()
  prune(map, now)
  const bucket = map.get(key)
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs })
  } else {
    bucket.count += 1
  }
}

export function clearKey(key: string): void {
  buckets().delete(key)
}

export function retryAfterSeconds(keys: string[], now: number): number {
  let longest = 0
  for (const key of keys) {
    const bucket = buckets().get(key)
    if (bucket && bucket.resetAt > now) {
      longest = Math.max(longest, bucket.resetAt - now)
    }
  }
  return Math.max(1, Math.ceil(longest / 1000))
}

/** count one request against `key`; blocked once `max` is hit in the window */
export function consume(
  key: string,
  max: number,
  windowMs: number
): RateLimitDecision {
  const now = Date.now()
  if (!underLimit(key, max, now)) {
    return { blocked: true, retryAfterSeconds: retryAfterSeconds([key], now) }
  }
  increment(key, windowMs, now)
  return { blocked: false, retryAfterSeconds: 0 }
}
