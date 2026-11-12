import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { requireUser, requireAdmin } from "@/server/auth/middleware"
import { resolveBracket } from "@/server/playoffs/advance"
import * as scoring from "@/server/services/scoring"
import { publish, publishScoreUpdate } from "@/server/realtime/publish"

const recordSchema = z.object({
  matchId: z.string(),
  alliance: z.enum(["red", "blue"]),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
})

export const recordScoreEvent = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(recordSchema)
  .handler(({ data, context }) => {
    const event = scoring.recordScoreEvent(db, {
      ...data,
      createdBy: context.user.id,
    })
    publishScoreUpdate(db, data.matchId)
    return event
  })

export const undoScoreEvent = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ scoreEventId: z.string() }))
  .handler(({ data }) => {
    const event = scoring.undoScoreEvent(db, data.scoreEventId)
    publishScoreUpdate(db, event.matchId)
    return event
  })

export const postMatch = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ matchId: z.string() }))
  .handler(({ data }) => {
    const match = scoring.postMatch(db, data.matchId)
    publishScoreUpdate(db, data.matchId)
    if (match.type === "playoff") {
      resolveBracket(db, match.eventId)
      publish(match.eventId, "all", { type: "bracket_update", payload: null })
    } else {
      // a posted qualification result shifts the standings; tell every surface
      // (display rankings view, TV rankings panel, team dashboards) to refetch
      // so switching to a rankings view never shows pre-post numbers
      publish(match.eventId, "all", { type: "rankings_update", payload: null })
    }
    return match
  })

export const listScoreEvents = createServerFn()
  .middleware([requireUser])
  .validator(z.object({ matchId: z.string() }))
  .handler(({ data }) => scoring.listScoreEvents(db, data.matchId))

/**
 * Fully resets a match back to `scheduled` (even a posted one): clears all
 * score events, cached totals, winner + RP. Guards live/downstream-posted
 * matches (see `scoring.resetMatch`), then refreshes every affected surface.
 */
export const resetMatch = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ eventId: z.string(), matchId: z.string() }))
  .handler(({ data }) => {
    const match = scoring.resetMatch(db, data.eventId, data.matchId)
    publishScoreUpdate(db, data.matchId)
    if (match.type === "playoff") {
      resolveBracket(db, data.eventId)
      publish(data.eventId, "all", { type: "bracket_update", payload: null })
    } else {
      publish(data.eventId, "all", { type: "rankings_update", payload: null })
    }
    return match
  })
