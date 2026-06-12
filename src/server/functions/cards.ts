import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db, tables } from "@/db"
import { requireAdmin, requireUser } from "@/server/auth/middleware"
import * as cards from "@/server/services/cards"
import { publish, publishScoreUpdate } from "@/server/realtime/publish"

const cardTypeSchema = z.enum(["yellow", "red"])

function teamNumber(teamId: string): number | null {
  const row = db
    .select({ number: tables.teams.number })
    .from(tables.teams)
    .where(eq(tables.teams.id, teamId))
    .get()
  return row?.number ?? null
}

export const issueCard = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      eventId: z.string(),
      teamId: z.string(),
      type: cardTypeSchema,
      reason: z.string().max(280).default(""),
    })
  )
  .handler(({ data, context }) => {
    const result = cards.issueCard(db, {
      eventId: data.eventId,
      teamId: data.teamId,
      type: data.type,
      reason: data.reason.trim(),
      createdBy: context.user.id,
    })

    const number = teamNumber(data.teamId)
    const reasonSuffix = data.reason.trim() ? ` — ${data.reason.trim()}` : ""
    publish(data.eventId, "all", {
      type: "toast",
      message: `Team ${number ?? "?"} was issued a ${data.type} card${reasonSuffix}`,
      variant: "warning",
      durationMs: 6000,
    })
    publish(data.eventId, "all", { type: "cards_update", payload: null })
    if (result.affectedMatchId) {
      publishScoreUpdate(db, result.affectedMatchId)
    }
    return result.card
  })

export const revokeCard = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ cardId: z.string() }))
  .handler(({ data }) => {
    const card = cards.revokeCard(db, data.cardId)
    publish(card.eventId, "all", { type: "cards_update", payload: null })
    if (card.matchId) publishScoreUpdate(db, card.matchId)
    return card
  })

export const listCards = createServerFn()
  .middleware([requireUser])
  .validator(z.object({ eventId: z.string() }))
  .handler(({ data }) => cards.listCards(db, data.eventId))
