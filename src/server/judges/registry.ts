import type { AllianceColor } from "@/db/schema"
import type { PublishFn } from "@/server/engine/match-engine"

/**
 * Tracks live judge scorers per event so the control panel can show how many
 * have checked in (picked an alliance) and how many have submitted scores for
 * the current match. State is in-memory and presence-based: a judge stays
 * "active" while it heartbeats, and is pruned after {@link TTL_MS} of silence
 * (closed tab / lost connection). Submission is per-match, keyed by matchId, so
 * queuing a new match naturally resets the submitted count.
 */
const TTL_MS = 12_000

interface JudgeEntry {
  alliance: AllianceColor | null
  lastSeen: number
  submittedMatchId: string | null
}

export interface JudgeStatus {
  active: number
  judges: Array<{
    alliance: AllianceColor | null
    submittedMatchId: string | null
  }>
}

export class JudgeRegistry {
  private events = new Map<string, Map<string, JudgeEntry>>()
  private lastSignature = new Map<string, string>()

  constructor(private publishFn: PublishFn) {}

  checkIn(eventId: string, judgeId: string, alliance: AllianceColor | null) {
    const judges = this.ensure(eventId)
    const existing = judges.get(judgeId)
    judges.set(judgeId, {
      alliance,
      lastSeen: Date.now(),
      submittedMatchId: existing?.submittedMatchId ?? null,
    })
    this.broadcast(eventId)
    return this.status(eventId)
  }

  heartbeat(eventId: string, judgeId: string) {
    const judges = this.ensure(eventId)
    const entry = judges.get(judgeId)
    if (entry) entry.lastSeen = Date.now()
    // a heartbeat is also when we notice peers that went silent
    this.broadcast(eventId)
    return this.status(eventId)
  }

  submit(eventId: string, judgeId: string, matchId: string) {
    const judges = this.ensure(eventId)
    const entry = judges.get(judgeId)
    if (entry) {
      entry.submittedMatchId = matchId
      entry.lastSeen = Date.now()
    }
    this.broadcast(eventId)
    return this.status(eventId)
  }

  resume(eventId: string, judgeId: string) {
    const judges = this.ensure(eventId)
    const entry = judges.get(judgeId)
    if (entry) {
      entry.submittedMatchId = null
      entry.lastSeen = Date.now()
    }
    this.broadcast(eventId)
    return this.status(eventId)
  }

  leave(eventId: string, judgeId: string) {
    this.ensure(eventId).delete(judgeId)
    this.broadcast(eventId)
    return this.status(eventId)
  }

  status(eventId: string): JudgeStatus {
    const judges = this.prune(eventId)
    return {
      active: judges.size,
      judges: [...judges.values()].map((e) => ({
        alliance: e.alliance,
        submittedMatchId: e.submittedMatchId,
      })),
    }
  }

  private ensure(eventId: string): Map<string, JudgeEntry> {
    let judges = this.events.get(eventId)
    if (!judges) {
      judges = new Map()
      this.events.set(eventId, judges)
    }
    return judges
  }

  private prune(eventId: string): Map<string, JudgeEntry> {
    const judges = this.ensure(eventId)
    const cutoff = Date.now() - TTL_MS
    for (const [id, entry] of judges) {
      if (entry.lastSeen < cutoff) judges.delete(id)
    }
    return judges
  }

  /** publishes to control only when the visible status actually changed */
  private broadcast(eventId: string) {
    const status = this.status(eventId)
    const signature = JSON.stringify(status)
    if (this.lastSignature.get(eventId) === signature) return
    this.lastSignature.set(eventId, signature)
    this.publishFn(eventId, ["control"], {
      type: "judges_update",
      payload: status,
    })
  }
}
