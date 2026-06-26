import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import type { EventSettings } from "@/db/schema"
import { getViewRotator } from "@/server/display/instance"
import { requireAdmin, requireUser } from "@/server/auth/middleware"
import { publish } from "@/server/realtime/publish"
import * as events from "@/server/services/events"

/** the `settings_update` realtime payload carrying every display-relevant flag */
function settingsUpdate(settings: EventSettings) {
  return {
    type: "settings_update" as const,
    flipAllianceSides: settings.flipAllianceSides ?? false,
    finalsBestOf3: settings.finalsBestOf3 ?? false,
    hideAfterMatchEnd: settings.hideAfterMatchEnd ?? false,
    autoRotateViews: settings.autoRotateViews ?? false,
    alwaysShowLineup: settings.alwaysShowLineup ?? false,
  }
}

export const listEvents = createServerFn()
  .middleware([requireUser])
  .handler(() => events.listEvents(db))

export const getEvent = createServerFn()
  .middleware([requireUser])
  .validator(z.object({ eventId: z.string() }))
  .handler(({ data }) => events.getEvent(db, data.eventId))

export const getEventBySlug = createServerFn()
  .middleware([requireUser])
  .validator(z.object({ slug: z.string() }))
  .handler(({ data }) => events.getEventBySlug(db, data.slug))

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ eventId: z.string() }))
  .handler(({ data }) => events.deleteEvent(db, data.eventId))

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ name: z.string().min(1), slug: z.string().optional() }))
  .handler(({ data }) => events.createEvent(db, data))

export const duplicateEvent = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ sourceEventId: z.string(), name: z.string().min(1) }))
  .handler(({ data }) =>
    events.duplicateEvent(db, data.sourceEventId, data.name)
  )

export const listEventTeams = createServerFn()
  .middleware([requireUser])
  .validator(z.object({ eventId: z.string() }))
  .handler(({ data }) => events.listEventTeams(db, data.eventId))

export const attachTeams = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ eventId: z.string(), teamIds: z.array(z.string()) }))
  .handler(({ data }) => events.attachTeams(db, data.eventId, data.teamIds))

export const detachTeam = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ eventId: z.string(), teamId: z.string() }))
  .handler(({ data }) => events.detachTeam(db, data.eventId, data.teamId))

export const importRoster = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ eventId: z.string(), sourceEventId: z.string() }))
  .handler(({ data }) =>
    events.importRoster(db, data.eventId, data.sourceEventId)
  )

export const setFlipAllianceSides = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ eventId: z.string(), flip: z.boolean() }))
  .handler(({ data }) => {
    const event = events.setFlipAllianceSides(db, data.eventId, data.flip)
    publish(data.eventId, "all", settingsUpdate(event.settings))
    return event.settings.flipAllianceSides ?? false
  })

/** Toggle one of the audience-display automation settings. */
export const setDisplaySetting = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      eventId: z.string(),
      key: z.enum(["hideAfterMatchEnd", "autoRotateViews", "alwaysShowLineup"]),
      value: z.boolean(),
    })
  )
  .handler(({ data }) => {
    const event = events.setDisplayBehavior(
      db,
      data.eventId,
      data.key,
      data.value
    )
    publish(data.eventId, "all", settingsUpdate(event.settings))
    // start/stop the rotation timer to match the new setting; toggling
    // auto-rotate is explicit, so clear any lingering post-match hold too
    if (data.key === "autoRotateViews") getViewRotator().release(data.eventId)
    else getViewRotator().sync(data.eventId)
    return event.settings
  })

export const advanceStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
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
