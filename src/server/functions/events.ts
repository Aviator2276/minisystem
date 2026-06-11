import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { requireAdmin, requireUser } from "@/server/auth/middleware"
import { publish } from "@/server/realtime/publish"
import * as events from "@/server/services/events"

export const listEvents = createServerFn()
  .middleware([requireUser])
  .handler(() => events.listEvents(db))

export const getEvent = createServerFn()
  .middleware([requireUser])
  .inputValidator(z.object({ eventId: z.string() }))
  .handler(({ data }) => events.getEvent(db, data.eventId))

export const getEventBySlug = createServerFn()
  .middleware([requireUser])
  .inputValidator(z.object({ slug: z.string() }))
  .handler(({ data }) => events.getEventBySlug(db, data.slug))

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(z.object({ eventId: z.string() }))
  .handler(({ data }) => events.deleteEvent(db, data.eventId))

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(
    z.object({ name: z.string().min(1), slug: z.string().optional() })
  )
  .handler(({ data }) => events.createEvent(db, data))

export const listEventTeams = createServerFn()
  .middleware([requireUser])
  .inputValidator(z.object({ eventId: z.string() }))
  .handler(({ data }) => events.listEventTeams(db, data.eventId))

export const attachTeams = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(
    z.object({ eventId: z.string(), teamIds: z.array(z.string()) })
  )
  .handler(({ data }) => events.attachTeams(db, data.eventId, data.teamIds))

export const detachTeam = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(z.object({ eventId: z.string(), teamId: z.string() }))
  .handler(({ data }) => events.detachTeam(db, data.eventId, data.teamId))

export const importRoster = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(z.object({ eventId: z.string(), sourceEventId: z.string() }))
  .handler(({ data }) =>
    events.importRoster(db, data.eventId, data.sourceEventId)
  )

export const setFlipAllianceSides = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(z.object({ eventId: z.string(), flip: z.boolean() }))
  .handler(({ data }) => {
    const event = events.setFlipAllianceSides(db, data.eventId, data.flip)
    publish(data.eventId, "all", {
      type: "settings_update",
      flipAllianceSides: data.flip,
    })
    return event.settings.flipAllianceSides ?? false
  })

export const advanceStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(
    z.object({
      eventId: z.string(),
      to: z.enum([
        "setup",
        "quals",
        "alliance_selection",
        "playoffs",
        "complete",
      ]),
    })
  )
  .handler(({ data }) => events.advanceStatus(db, data.eventId, data.to))
