import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db, tables } from "@/db"
import { getMatchEngine } from "@/server/engine/instance"
import { requireAdmin } from "@/server/auth/middleware"
import { publicRateLimit } from "@/server/rate-limit/middleware"
import { computeCardStates } from "@/server/services/cards"
import { EMPTY_CARD_STATE } from "@/shared/cards"
import { getBracket } from "@/server/playoffs/advance"
import { publish } from "@/server/realtime/publish"
import { computeRankings } from "@/server/services/rankings"
import { getSelectionState } from "@/server/services/selection"
import * as events from "@/server/services/events"
import * as matches from "@/server/services/matches"

export const DISPLAY_VIEWS = [
  "match",
  "lineup",
  "results",
  "rankings",
  "selection",
  "bracket",
  "schedule",
  "intermission",
  "camera",
] as const
export type DisplayView = (typeof DISPLAY_VIEWS)[number]

export const setDisplayView = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({ eventId: z.string(), view: z.enum(DISPLAY_VIEWS) })
  )
  .handler(({ data }) => {
    db.update(tables.events)
      .set({ displayView: data.view })
      .where(eq(tables.events.id, data.eventId))
      .run()
    publish(data.eventId, "all", { type: "view_change", view: data.view })
    return data.view
  })

/**
 * Public (unauthenticated) bootstrap for the audience display screen and TV
 * pages: nothing here is sensitive, and the venue display shouldn't need a
 * login. Live updates ride the public realtime channel.
 */
export const getDisplayBootstrap = createServerFn()
  .middleware([publicRateLimit])
  .validator(z.object({ slug: z.string() }))
  .handler(({ data }) => {
    const event = events.getEventBySlug(db, data.slug)
    const roster = events.listEventTeams(db, event.id)
    const allParticipants = db.select().from(tables.participants).all()
    const cardStates = computeCardStates(db, event.id)
    return {
      event: {
        id: event.id,
        slug: event.slug,
        name: event.name,
        gameId: event.gameId,
        status: event.status,
        displayView: event.displayView as DisplayView,
        flipAllianceSides: event.settings.flipAllianceSides ?? false,
      },
      field: getMatchEngine().getFieldState(event.id),
      matches: matches.listMatches(db, event.id),
      teams: roster.map((t) => ({
        teamId: t.teamId,
        number: t.number,
        name: t.name,
        participants: allParticipants
          .filter((p) => p.teamId === t.teamId)
          .map((p) => p.name),
        cards: cardStates.get(t.teamId) ?? EMPTY_CARD_STATE,
      })),
      rankings: computeRankings(db, event.id),
      selection: getSelectionState(db, event.id),
      bracket: getBracket(db, event.id),
    }
  })

/** public list of events for the landing page */
export const listPublicEvents = createServerFn()
  .middleware([publicRateLimit])
  .handler(() =>
    db
      .select({
        id: tables.events.id,
        slug: tables.events.slug,
        name: tables.events.name,
        status: tables.events.status,
      })
      .from(tables.events)
      .all()
  )
