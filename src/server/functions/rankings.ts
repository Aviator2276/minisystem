import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { requireUser } from "@/server/auth/middleware"
import { computeRankings } from "@/server/services/rankings"

export const getRankings = createServerFn()
  .middleware([requireUser])
  .inputValidator(z.object({ eventId: z.string() }))
  .handler(({ data }) => computeRankings(db, data.eventId))
