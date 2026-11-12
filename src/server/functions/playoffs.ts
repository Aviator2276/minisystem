import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { requireAdmin, requireUser } from "@/server/auth/middleware"
import {
  createExtraPlayoffMatch,
  extendFinalsSeries,
  generateBracket,
  getBracket,
  playoffMatches,
  reshapeFinals,
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
 * Create an off-bracket "extra" playoff match between two alliances (by number).
 * It has no bracket slot, so it never affects bracket resolution or the champion
 * — it just queues/scores/displays like a normal match.
 */
export const addExtraPlayoffMatch = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      eventId: z.string(),
      redAllianceNumber: z.number().int().positive(),
      blueAllianceNumber: z.number().int().positive(),
    })
  )
  .handler(({ data }) => {
    const match = createExtraPlayoffMatch(
      db,
      data.eventId,
      data.redAllianceNumber,
      data.blueAllianceNumber
    )
    publish(data.eventId, "all", { type: "bracket_update", payload: null })
    return match
  })

/**
 * Append one more game to the grand-final series between the same two
 * finalists. Counts toward the bracket: raises the wins needed to win the
 * event, so it can reopen an already-decided series.
 */
export const extendFinals = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ eventId: z.string() }))
  .handler(({ data }) => {
    const changed = extendFinalsSeries(db, data.eventId)
    publish(data.eventId, "all", { type: "bracket_update", payload: null })
    return { changed }
  })

/**
 * Toggle the best-of-3 finals setting. When a bracket already exists the
 * finals slot(s) are reshaped in place (full regeneration when nothing has
 * posted yet), so the format can still change mid-playoffs; it locks only
 * once a finals match is on the field or has posted results.
 */
export const setFinalsBestOf3 = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ eventId: z.string(), value: z.boolean() }))
  .handler(({ data }) => {
    const event = events.getEvent(db, data.eventId)
    const existing =
      event.status === "playoffs" ? playoffMatches(db, data.eventId) : []
    // validate before persisting the setting so a rejected toggle rolls back
    // cleanly on the client
    if (existing.some((m) => m.status === "posted")) {
      reshapeFinals(db, data.eventId, data.value)
      events.setFinalsBestOf3(db, data.eventId, data.value)
      publish(data.eventId, "all", { type: "bracket_update", payload: null })
    } else {
      events.setFinalsBestOf3(db, data.eventId, data.value)
      if (existing.length > 0) {
        generateBracket(db, data.eventId)
        publish(data.eventId, "all", { type: "bracket_update", payload: null })
      }
    }
    publish(data.eventId, "all", {
      type: "settings_update",
      flipAllianceSides: event.settings.flipAllianceSides ?? false,
      finalsBestOf3: data.value,
    })
    return data.value
  })
