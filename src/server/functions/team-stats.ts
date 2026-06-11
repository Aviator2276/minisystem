import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { requireUser } from "@/server/auth/middleware"
import * as teamStats from "@/server/services/team-stats"

export const getTeamDashboard = createServerFn()
  .middleware([requireUser])
  .inputValidator(z.object({ eventId: z.string().optional() }).default({}))
  .handler(({ data, context }) => {
    if (!context.user.teamId)
      throw new Error("This account is not linked to a team")
    return teamStats.getTeamDashboard(db, context.user.teamId, data.eventId)
  })
