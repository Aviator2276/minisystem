import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { requireAdmin, requireUser } from "@/server/auth/middleware"
import { generateBracket, getBracket } from "@/server/playoffs/advance"
import { publish } from "@/server/realtime/publish"

export const generatePlayoffBracket = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ eventId: z.string() }))
  .handler(({ data }) => {
    const matches = generateBracket(db, data.eventId)
    publish(data.eventId, "all", { type: "bracket_update", payload: null })
    return matches
  })

export const getBracketView = createServerFn()
  .middleware([requireUser])
  .validator(z.object({ eventId: z.string() }))
  .handler(({ data }) => getBracket(db, data.eventId))
