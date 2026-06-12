import { and, asc, eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import { cardStateFrom } from "@/shared/cards"
import type { CardType, TeamCardState } from "@/shared/cards"
import { getEvent } from "./events"
import { getMatch } from "./matches"
import { recomputeMatchScore } from "./scoring"

export type CardRow = typeof tables.cards.$inferSelect

/** non-revoked cards for an event, oldest first */
export function listCards(db: Db, eventId: string): CardRow[] {
  return db
    .select()
    .from(tables.cards)
    .where(
      and(eq(tables.cards.eventId, eventId), eq(tables.cards.revoked, false))
    )
    .orderBy(asc(tables.cards.createdAt), asc(tables.cards.id))
    .all()
}

/** per-team card/disqualification state for an event, keyed by teamId */
export function computeCardStates(
  db: Db,
  eventId: string
): Map<string, TeamCardState> {
  const counts = new Map<string, { yellows: number; reds: number }>()
  for (const card of listCards(db, eventId)) {
    const entry = counts.get(card.teamId) ?? { yellows: 0, reds: 0 }
    if (card.type === "yellow") entry.yellows += 1
    else entry.reds += 1
    counts.set(card.teamId, entry)
  }
  const states = new Map<string, TeamCardState>()
  for (const [teamId, { yellows, reds }] of counts) {
    states.set(teamId, cardStateFrom(yellows, reds))
  }
  return states
}

/** team ids disqualified at this event */
export function disqualifiedTeamIds(db: Db, eventId: string): Set<string> {
  const out = new Set<string>()
  for (const [teamId, state] of computeCardStates(db, eventId)) {
    if (state.disqualified) out.add(teamId)
  }
  return out
}

export interface IssueCardResult {
  card: CardRow
  /** match whose score was zeroed by this red card, if any */
  affectedMatchId: string | null
}

/**
 * Issue a yellow/red card to a team. A red card given to a team in the
 * currently-running (or just-scored) match zeroes that alliance's score for
 * the match; the link is recorded so the effect can be undone on revoke.
 */
export function issueCard(
  db: Db,
  input: {
    eventId: string
    teamId: string
    type: CardType
    reason: string
    createdBy: string
  }
): IssueCardResult {
  const inRoster = db
    .select({ id: tables.eventTeams.id })
    .from(tables.eventTeams)
    .where(
      and(
        eq(tables.eventTeams.eventId, input.eventId),
        eq(tables.eventTeams.teamId, input.teamId)
      )
    )
    .get()
  if (!inRoster) throw new Error("Team is not entered in this event")

  return db.transaction((tx) => {
    let matchId: string | null = null
    if (input.type === "red") {
      const event = getEvent(tx, input.eventId)
      if (event.currentMatchId) {
        const match = getMatch(tx, event.currentMatchId)
        const lineup = [
          match.red1,
          match.red2,
          match.red3,
          match.blue1,
          match.blue2,
          match.blue3,
        ]
        if (
          lineup.includes(input.teamId) &&
          (match.status === "running" || match.status === "scored")
        ) {
          matchId = match.id
        }
      }
    }

    const card = tx
      .insert(tables.cards)
      .values({
        eventId: input.eventId,
        teamId: input.teamId,
        type: input.type,
        reason: input.reason,
        matchId,
        createdBy: input.createdBy,
      })
      .returning()
      .get()

    if (matchId) recomputeMatchScore(tx, matchId)
    return { card, affectedMatchId: matchId }
  })
}

/** Revoke a card (referee correction); recomputes any match it had zeroed. */
export function revokeCard(db: Db, cardId: string): CardRow {
  return db.transaction((tx) => {
    const card = tx
      .update(tables.cards)
      .set({ revoked: true })
      .where(eq(tables.cards.id, cardId))
      .returning()
      .get() as CardRow | undefined
    if (!card) throw new Error("Card not found")
    if (card.matchId) recomputeMatchScore(tx, card.matchId)
    return card
  })
}
