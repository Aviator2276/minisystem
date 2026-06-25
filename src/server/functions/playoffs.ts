import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { requireAdmin, requireUser } from "@/server/auth/middleware"
import {
  generateBracket,
  getBracket,
  playoffMatches,
} from "@/server/playoffs/advance"
import { publish } from "@/server/realtime/publish"
import * as events from "@/server/services/events"

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

/**
 * Toggle the best-of-3 finals setting. When a bracket already exists (and no
 * playoff match has been posted) the bracket is regenerated so the finals
 * series appears/collapses immediately; once results are in, the format is
 * locked.
 */
export const setFinalsBestOf3 = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ eventId: z.string(), value: z.boolean() }))
  .handler(({ data }) => {
    const event = events.getEvent(db, data.eventId)
    const existing =
      event.status === "playoffs" ? playoffMatches(db, data.eventId) : []
    if (existing.some((m) => m.status === "posted")) {
      throw new Error(
        "Can't change the finals format after playoff matches have started"
      )
    }
    events.setFinalsBestOf3(db, data.eventId, data.value)
    if (existing.length > 0) {
      generateBracket(db, data.eventId)
      publish(data.eventId, "all", { type: "bracket_update", payload: null })
    }
    publish(data.eventId, "all", {
      type: "settings_update",
      flipAllianceSides: event.settings.flipAllianceSides ?? false,
      finalsBestOf3: data.value,
    })
    return data.value
  })
