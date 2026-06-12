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
    }
    return match
  })

export const listScoreEvents = createServerFn()
  .middleware([requireUser])
  .validator(z.object({ matchId: z.string() }))
  .handler(({ data }) => scoring.listScoreEvents(db, data.matchId))
