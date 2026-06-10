import type { Db } from "@/db"
import { getMatch } from "@/server/services/matches"
import type { CachedAllianceScore } from "@/server/services/scoring"
import { channels, topicFor } from "@/shared/realtime-messages"
import type { Channel, ServerMessage } from "@/shared/realtime-messages"
import { getWsAdapter } from "./ws"

// The single seam for all server->client realtime traffic. Swap the internals
// to SSE here (and in use-realtime) if WebSockets ever fight back.
export function publish(
  eventId: string,
  to: Channel[] | "all",
  message: ServerMessage
): void {
  const adapter = getWsAdapter()
  const targets = to === "all" ? channels : to
  const data = JSON.stringify(message)
  for (const channel of targets) {
    adapter.publish(topicFor(eventId, channel), data)
  }
}

export function publishScoreUpdate(db: Db, matchId: string): void {
  const match = getMatch(db, matchId)
  publish(match.eventId, "all", {
    type: "score_update",
    matchId,
    status: match.status,
    winner: match.winner ?? null,
    red: (match.redScore as CachedAllianceScore | null)?.totals ?? null,
    blue: (match.blueScore as CachedAllianceScore | null)?.totals ?? null,
    redState: (match.redScore as CachedAllianceScore | null)?.state ?? null,
    blueState: (match.blueScore as CachedAllianceScore | null)?.state ?? null,
  })
}
