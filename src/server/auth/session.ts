import { createHash, randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { db, tables } from "@/db"

export const SESSION_COOKIE = "minisystem_session"
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

export interface SessionUser {
  id: string
  role: "admin" | "team"
  username: string
  teamId: string | null
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function createSession(userId: string): {
  token: string
  expiresAt: Date
} {
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  db.insert(tables.sessions)
    .values({ id: hashToken(token), userId, expiresAt })
    .run()
  return { token, expiresAt }
}

export function getSessionUser(token: string | undefined): SessionUser | null {
  if (!token) return null
  const row = db
    .select({
      expiresAt: tables.sessions.expiresAt,
      id: tables.users.id,
      role: tables.users.role,
      username: tables.users.username,
      teamId: tables.users.teamId,
    })
    .from(tables.sessions)
    .innerJoin(tables.users, eq(tables.sessions.userId, tables.users.id))
    .where(eq(tables.sessions.id, hashToken(token)))
    .get()
  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) {
    db.delete(tables.sessions)
      .where(eq(tables.sessions.id, hashToken(token)))
      .run()
    return null
  }
  return {
    id: row.id,
    role: row.role,
    username: row.username,
    teamId: row.teamId,
  }
}

export function destroySession(token: string | undefined): void {
  if (!token) return
  db.delete(tables.sessions)
    .where(eq(tables.sessions.id, hashToken(token)))
    .run()
}

export function sessionCookie(token: string, expiresAt: Date): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
