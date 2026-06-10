import { createServerFn } from "@tanstack/react-start"
import {
  deleteCookie,
  getCookie,
  setCookie,
  setResponseStatus,
} from "@tanstack/react-start/server"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db, tables } from "@/db"
import { verifyPassword } from "@/server/auth/password"
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

export const login = createServerFn({ method: "POST" })
  .inputValidator(credentialsSchema)
  .handler(({ data }): SessionUser => {
    const user = db
      .select()
      .from(tables.users)
      .where(eq(tables.users.username, data.username))
      .get()
    if (!user || !verifyPassword(data.password, user.passwordHash)) {
      setResponseStatus(401)
      throw new Error("Invalid username or password")
    }
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
