import { randomBytes } from "node:crypto"
import { asc, eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import { hashPassword } from "@/server/auth/password"

export function listTeams(db: Db) {
  const teams = db
    .select()
    .from(tables.teams)
    .orderBy(asc(tables.teams.number))
    .all()
  const participants = db.select().from(tables.participants).all()
  const accounts = new Set(
    db
      .select({ teamId: tables.users.teamId })
      .from(tables.users)
      .where(eq(tables.users.role, "team"))
      .all()
      .map((u) => u.teamId)
  )
  return teams.map((team) => ({
    ...team,
    participants: participants.filter((p) => p.teamId === team.id),
    hasAccount: accounts.has(team.id),
  }))
}

export function createTeam(db: Db, input: { number: number; name: string }) {
  return db.insert(tables.teams).values(input).returning().get()
}

export function updateTeam(
  db: Db,
  id: string,
  input: { number?: number; name?: string }
) {
  return db
    .update(tables.teams)
    .set(input)
    .where(eq(tables.teams.id, id))
    .returning()
    .get()
}

export function deleteTeam(db: Db, id: string) {
  db.delete(tables.users).where(eq(tables.users.teamId, id)).run()
  db.delete(tables.eventTeams).where(eq(tables.eventTeams.teamId, id)).run()
  // Null out match slots so history is preserved but shows no team
  for (const col of [
    "red1",
    "red2",
    "red3",
    "blue1",
    "blue2",
    "blue3",
  ] as const) {
    db.update(tables.matches)
      .set({ [col]: null })
      .where(eq(tables.matches[col], id))
      .run()
  }
  // Null out alliance slots
  for (const col of [
    "captainTeamId",
    "pick1TeamId",
    "pick2TeamId",
    "backupTeamId",
  ] as const) {
    db.update(tables.alliances)
      .set({ [col]: null })
      .where(eq(tables.alliances[col], id))
      .run()
  }
  db.delete(tables.teams).where(eq(tables.teams.id, id)).run()
}

export function addParticipant(db: Db, teamId: string, name: string) {
  return db
    .insert(tables.participants)
    .values({ teamId, name })
    .returning()
    .get()
}

export function removeParticipant(db: Db, id: string) {
  db.delete(tables.participants).where(eq(tables.participants.id, id)).run()
}

/**
 * Creates (or resets) the team's login. Admins may supply a custom password;
 * otherwise one is generated. Returns the one-time plaintext password.
 */
export function provisionTeamAccount(
  db: Db,
  teamId: string,
  customPassword?: string
) {
  const team = db
    .select()
    .from(tables.teams)
    .where(eq(tables.teams.id, teamId))
    .get()
  if (!team) throw new Error("Team not found")
  const username = String(team.number).padStart(2, "0")
  const password = customPassword?.trim() || randomBytes(4).toString("hex")
  const passwordHash = hashPassword(password)

  const existing = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.teamId, teamId))
    .get()
  if (existing) {
    db.update(tables.users)
      .set({ username, passwordHash })
      .where(eq(tables.users.id, existing.id))
      .run()
  } else {
    db.insert(tables.users)
      .values({ role: "team", username, passwordHash, teamId })
      .run()
  }
  return { username, password }
}
