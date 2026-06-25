import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { requireAdmin, requireUser } from "@/server/auth/middleware"
import { publish } from "@/server/realtime/publish"
import { adjustRankingPoints } from "@/server/services/events"
import { computeRankings } from "@/server/services/rankings"

export const getRankings = createServerFn()
  .middleware([requireUser])
  .validator(z.object({ eventId: z.string() }))
  .handler(({ data }) => computeRankings(db, data.eventId))

/** Admin +1/-1 to a team's manual ranking points; returns the new rankings. */
export const adjustTeamRankingPoints = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      eventId: z.string(),
      teamId: z.string(),
      delta: z.number().int(),
    })
  )
  .handler(({ data }) => {
    adjustRankingPoints(db, data.eventId, data.teamId, data.delta)
    publish(data.eventId, "all", { type: "rankings_update", payload: null })
    return computeRankings(db, data.eventId)
  })
