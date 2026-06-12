import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireUser } from "@/server/auth/middleware"
import { getJudgeRegistry } from "@/server/judges/instance"

const allianceEnum = z.enum(["red", "blue"]).nullable()

/** judge picked an alliance — counts as an active scorer for the event */
export const judgeCheckIn = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      eventId: z.string(),
      judgeId: z.string(),
      alliance: allianceEnum,
    })
  )
  .handler(({ data }) =>
    getJudgeRegistry().checkIn(data.eventId, data.judgeId, data.alliance)
  )

/** keep-alive; a judge that stops heartbeating is pruned from the active set */
export const judgeHeartbeat = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ eventId: z.string(), judgeId: z.string() }))
  .handler(({ data }) =>
    getJudgeRegistry().heartbeat(data.eventId, data.judgeId)
  )

/** judge is done scoring this match (does not post the match) */
export const judgeSubmit = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      eventId: z.string(),
      judgeId: z.string(),
      matchId: z.string(),
    })
  )
  .handler(({ data }) =>
    getJudgeRegistry().submit(data.eventId, data.judgeId, data.matchId)
  )

/** judge reopens scoring after submitting */
export const judgeResume = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ eventId: z.string(), judgeId: z.string() }))
  .handler(({ data }) => getJudgeRegistry().resume(data.eventId, data.judgeId))

/** judge closed the page / switched away */
export const judgeLeave = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ eventId: z.string(), judgeId: z.string() }))
  .handler(({ data }) => getJudgeRegistry().leave(data.eventId, data.judgeId))

export const getJudgeStatus = createServerFn()
  .middleware([requireUser])
  .validator(z.object({ eventId: z.string() }))
  .handler(({ data }) => getJudgeRegistry().status(data.eventId))
