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
