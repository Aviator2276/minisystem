import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start"
import {
  getRequestHeader,
  getRequestIP,
  setResponseHeader,
  setResponseStatus,
} from "@tanstack/react-start/server"
import { consume } from "./core"

/**
 * Per-IP fixed-window limits for unauthenticated server functions. The
 * public cap is deliberately generous: a whole venue often sits behind one
 * NAT'd IP, and every public/TV page re-fetches its bootstrap on realtime
 * score updates. The goal is to stop a single host hammering the heavy
 * public reads, not to meter normal spectators.
 */
const PUBLIC_MAX = 1200 // requests per IP per window
const PUBLIC_WINDOW_MS = 60 * 1000
const DEBUG_MAX = 10
const DEBUG_WINDOW_MS = 60 * 1000

/**
 * Best-effort client IP; null when there is no usable request context (an
 * internal server-side invocation), in which case limiting is skipped —
 * counting contextless calls against one shared key would throttle all
 * visitors collectively.
 */
// server-only: reads request context. Wrapping it keeps the server-only
// `@tanstack/react-start/server` imports out of the client bundle — without
// this, `clientIp` is a plain export reachable from client code (via the
// server functions that use these middlewares) and trips import protection.
export const clientIp = createServerOnlyFn((): string | null => {
  try {
    return (
      getRequestIP({ xForwardedFor: true }) ??
      getRequestHeader("x-real-ip") ??
      null
    )
  } catch {
    return null
  }
})

function limitBy(name: string, max: number, windowMs: number) {
  return createMiddleware({ type: "function" }).server(({ next }) => {
    const ip = clientIp()
    if (ip !== null) {
      const decision = consume(`${name}:${ip}`, max, windowMs)
      if (decision.blocked) {
        setResponseHeader("Retry-After", String(decision.retryAfterSeconds))
        setResponseStatus(429)
        throw new Error("Too many requests. Please slow down.")
      }
    }
    return next()
  })
}

/** for unauthenticated endpoints (public bootstraps, login, current user) */
export const publicRateLimit = limitBy("public", PUBLIC_MAX, PUBLIC_WINDOW_MS)

/** strict cap for the unauthenticated realtime debug publish helper */
export const debugRateLimit = limitBy("debug", DEBUG_MAX, DEBUG_WINDOW_MS)
