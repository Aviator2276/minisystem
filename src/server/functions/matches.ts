import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { requireAdmin, requireUser } from "@/server/auth/middleware"
import * as matches from "@/server/services/matches"

export const listMatches = createServerFn()
  .middleware([requireUser])
  .inputValidator(z.object({ eventId: z.string() }))
  .handler(({ data }) => matches.listMatches(db, data.eventId))

export const regenerateQualSchedule = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(
    z.object({
      eventId: z.string(),
      roundsPerTeam: z.number().int().min(1).max(12),
    })
  )
  .handler(({ data }) =>
    matches.regenerateQualSchedule(db, data.eventId, data.roundsPerTeam)
  )

export const generateMoreQualMatches = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(
    z.object({
      eventId: z.string(),
      additionalRounds: z.number().int().min(1).max(12),
    })
  )
  .handler(({ data }) =>
    matches.generateMoreQualMatches(db, data.eventId, data.additionalRounds)
  )

export const createCustomMatch = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(
    z.object({
      eventId: z.string(),
      matchType: z.enum(["qualification", "practice"]),
      red: z.array(z.string().nullable()).length(3),
      blue: z.array(z.string().nullable()).length(3),
    })
  )
  .handler(({ data }) =>
    matches.createCustomMatch(db, data.eventId, {
      matchType: data.matchType,
      red: data.red,
      blue: data.blue,
    })
  )

export const deleteMatch = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(z.object({ eventId: z.string(), matchId: z.string() }))
  .handler(({ data }) => matches.deleteMatch(db, data.eventId, data.matchId))
