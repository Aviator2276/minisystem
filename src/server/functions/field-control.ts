import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getMatchEngine } from "@/server/engine/instance"
import { requireAdmin, requireUser } from "@/server/auth/middleware"

const eventInput = z.object({ eventId: z.string() })

export const getFieldState = createServerFn()
  .middleware([requireUser])
  .inputValidator(eventInput)
  .handler(({ data }) => getMatchEngine().getFieldState(data.eventId))

export const setCurrentMatch = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(z.object({ eventId: z.string(), matchId: z.string() }))
  .handler(({ data }) =>
    getMatchEngine().setCurrentMatch(data.eventId, data.matchId)
  )

export const noEntry = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(eventInput)
  .handler(({ data }) => getMatchEngine().noEntry(data.eventId))

export const safeToEnter = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(eventInput)
  .handler(({ data }) => getMatchEngine().safeToEnter(data.eventId))

export const playMatch = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(eventInput)
  .handler(({ data }) => getMatchEngine().playMatch(data.eventId))

export const fieldFault = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(eventInput)
  .handler(({ data }) => getMatchEngine().fieldFault(data.eventId))

export const replayMatch = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(eventInput)
  .handler(({ data }) => getMatchEngine().replayMatch(data.eventId))
