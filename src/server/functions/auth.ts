import { createServerFn } from "@tanstack/react-start"
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  setCookie,
  setResponseHeader,
  setResponseStatus,
} from "@tanstack/react-start/server"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db, tables } from "@/db"
import { verifyPassword } from "@/server/auth/password"
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "@/server/auth/rate-limit"
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  getSessionUser,
} from "@/server/auth/session"
import type { SessionUser } from "@/server/auth/session"

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

/** best-effort client IP for rate limiting; falls back so it never throws */
function clientIp(): string {
  try {
    return (
      getRequestIP({ xForwardedFor: true }) ??
      getRequestHeader("x-real-ip") ??
      "unknown"
    )
  } catch {
    return "unknown"
  }
}

function formatRetry(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60)
    return `${minutes} minute${minutes === 1 ? "" : "s"}`
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`
}

export const login = createServerFn({ method: "POST" })
  .inputValidator(credentialsSchema)
  .handler(({ data }): SessionUser => {
    const ip = clientIp()
    const limit = checkLoginRateLimit(ip, data.username)
    if (limit.blocked) {
      setResponseHeader("Retry-After", String(limit.retryAfterSeconds))
      setResponseStatus(429)
      throw new Error(
        `Too many login attempts. Try again in ${formatRetry(limit.retryAfterSeconds)}.`
      )
    }

    const user = db
      .select()
      .from(tables.users)
      .where(eq(tables.users.username, data.username))
      .get()
    if (!user || !verifyPassword(data.password, user.passwordHash)) {
      recordLoginFailure(ip, data.username)
      setResponseStatus(401)
      throw new Error("Invalid username or password")
    }
    clearLoginFailures(ip, data.username)
    const { token, expiresAt } = createSession(user.id)
    setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
      secure: process.env.NODE_ENV === "production",
    })
    return {
      id: user.id,
      role: user.role,
      username: user.username,
      teamId: user.teamId,
    }
  })

export const logout = createServerFn({ method: "POST" }).handler(() => {
  destroySession(getCookie(SESSION_COOKIE))
  deleteCookie(SESSION_COOKIE, { path: "/" })
  return null
})

export const getCurrentUser = createServerFn().handler(
  (): SessionUser | null => {
    return getSessionUser(getCookie(SESSION_COOKIE))
  }
)
