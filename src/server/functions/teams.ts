import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { requireAdmin } from "@/server/auth/middleware"
import * as teams from "@/server/services/teams"

export const listTeams = createServerFn()
  .middleware([requireAdmin])
  .handler(() => teams.listTeams(db))

export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({ number: z.number().int().positive(), name: z.string().min(1) })
  )
  .handler(({ data }) => teams.createTeam(db, data))

export const updateTeam = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      id: z.string(),
      number: z.number().int().positive().optional(),
      name: z.string().min(1).optional(),
    })
  )
  .handler(({ data: { id, ...input } }) => teams.updateTeam(db, id, input))

export const deleteTeam = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => teams.deleteTeam(db, data.id))

export const addParticipant = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ teamId: z.string(), name: z.string().min(1) }))
  .handler(({ data }) => teams.addParticipant(db, data.teamId, data.name))

export const removeParticipant = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => teams.removeParticipant(db, data.id))

export const provisionTeamAccount = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      teamId: z.string(),
      password: z.string().min(4).max(64).optional(),
    })
  )
  .handler(({ data }) =>
    teams.provisionTeamAccount(db, data.teamId, data.password)
  )
