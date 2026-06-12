import { eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import { getGame } from "@/games"
import type { GameDefinition } from "@/games/types"
import { getEvent } from "@/server/services/events"
import { getMatch } from "@/server/services/matches"
import { resetMatchScores } from "@/server/services/scoring"
import type { CachedAllianceScore } from "@/server/services/scoring"
import type { Channel, ServerMessage } from "@/shared/realtime-messages"

/**
 * Idle/terminal phases live here; while a match runs the phase is the game
 * plugin's phase id ("auto" | "teleop" | "endgame" for Stronghold).
 */
export type FieldPhase =
  | "no_entry"
  | "safe_to_enter"
  | "post_match"
  | "fault"
  | string

export type PublishFn = (
  eventId: string,
  to: Channel[] | "all",
  message: ServerMessage
) => void

export interface FieldState {
  matchId: string | null
  phase: FieldPhase
  /** absolute server epoch ms; null outside running phases */
  phaseEndsAt: number | null
  running: boolean
  serverNow: number
}

interface EngineEventState {
  matchId: string | null
  phase: FieldPhase
  phaseEndsAt: number | null
  running: boolean
  timers: ReturnType<typeof setTimeout>[]
}

/**
 * Server-authoritative field state machine. Phase transitions run on
 * setTimeout chains computed from the game plugin's timing; every transition
 * that matters is persisted (matches.startedAt/status) so a process restart
 * mid-match recovers by re-deriving the phase from the database.
 */
export class MatchEngine {
  private states = new Map<string, EngineEventState>()

  constructor(
    private db: Db,
    private publishFn: PublishFn
  ) {}

  getFieldState(eventId: string): FieldState {
    const s = this.ensure(eventId)
    return {
      matchId: s.matchId,
      phase: s.phase,
      phaseEndsAt: s.phaseEndsAt,
      running: s.running,
      serverNow: Date.now(),
    }
  }

  setCurrentMatch(eventId: string, matchId: string): FieldState {
    const s = this.ensure(eventId)
    if (s.running) throw new Error("Cannot change matches while one is running")
    const match = getMatch(this.db, matchId)
    if (match.eventId !== eventId)
      throw new Error("Match belongs to a different event")
    this.db
      .update(tables.events)
      .set({ currentMatchId: matchId })
      .where(eq(tables.events.id, eventId))
      .run()
    s.matchId = matchId
    if (s.phase === "post_match" || s.phase === "fault") s.phase = "no_entry"
    s.phaseEndsAt = null
    this.broadcastState(eventId)
    return this.getFieldState(eventId)
  }

  noEntry(eventId: string): FieldState {
    const s = this.ensure(eventId)
    if (s.running) throw new Error("Match is running")
    s.phase = "no_entry"
    s.phaseEndsAt = null
    this.broadcastState(eventId)
    this.publishFn(eventId, "all", {
      type: "toast",
      message: "Do not enter the field",
      variant: "warning",
      durationMs: null, // persists until the next phase change
    })
    return this.getFieldState(eventId)
  }

  safeToEnter(eventId: string): FieldState {
    const s = this.ensure(eventId)
    if (s.running) throw new Error("Match is running")
    s.phase = "safe_to_enter"
    s.phaseEndsAt = null
    this.broadcastState(eventId)
    this.publishFn(eventId, "all", {
      type: "toast",
      message: "Safe to enter the field",
      variant: "success",
      durationMs: 8000,
    })
    return this.getFieldState(eventId)
  }

  playMatch(eventId: string): FieldState {
    const s = this.ensure(eventId)
    if (s.running) throw new Error("Match is already running")
    if (!s.matchId) throw new Error("No match queued — select a match first")
    const match = getMatch(this.db, s.matchId)
    if (match.status === "posted")
      throw new Error("Match is already posted — replay it first")
    const game = this.gameFor(eventId)

    const startedAt = Date.now()
    this.db
      .update(tables.matches)
      .set({ status: "running", startedAt: new Date(startedAt) })
      .where(eq(tables.matches.id, s.matchId))
      .run()

    s.running = true
    this.scheduleTransitions(eventId, game, startedAt)

    const [first] = game.timeline as [
      (typeof game.timeline)[number],
      ...typeof game.timeline,
    ]
    this.enterPhase(eventId, first.id, startedAt + first.endMs, first.sound)
    return this.getFieldState(eventId)
  }

  fieldFault(eventId: string): FieldState {
    const s = this.ensure(eventId)
    if (!s.running || !s.matchId) throw new Error("No match is running")
    this.clearTimers(s)
    // keep startedAt + recorded scores; the match can be replayed or posted as-is
    this.db
      .update(tables.matches)
      .set({ status: "scored" })
      .where(eq(tables.matches.id, s.matchId))
      .run()
    s.running = false
    s.phase = "fault"
    s.phaseEndsAt = null
    this.broadcastState(eventId)
    this.publishScore(eventId, s.matchId)
    this.publishFn(eventId, "all", { type: "sound", cue: "field-fault" })
    this.publishFn(eventId, "all", {
      type: "toast",
      message: "Field fault — match stopped",
      variant: "warning",
      durationMs: null,
    })
    return this.getFieldState(eventId)
  }

  replayMatch(eventId: string): FieldState {
    const s = this.ensure(eventId)
    if (s.running) throw new Error("Match is running")
    if (!s.matchId) throw new Error("No match queued")
    const match = getMatch(this.db, s.matchId)
    if (match.status === "posted")
      throw new Error("Posted matches cannot be replayed")
    resetMatchScores(this.db, s.matchId)
    s.phase = "no_entry"
    s.phaseEndsAt = null
    this.broadcastState(eventId)
    // resetMatchScores cleared the cache, so this re-broadcasts status
    // "scheduled" with null scores
    this.publishScore(eventId, s.matchId)
    return this.getFieldState(eventId)
  }

  /** test/shutdown hook */
  dispose(): void {
    for (const s of this.states.values()) this.clearTimers(s)
    this.states.clear()
  }

  private ensure(eventId: string): EngineEventState {
    const existing = this.states.get(eventId)
    if (existing) return existing

    const event = getEvent(this.db, eventId)
    const s: EngineEventState = {
      matchId: event.currentMatchId,
      phase: "no_entry",
      phaseEndsAt: null,
      running: false,
      timers: [],
    }
    this.states.set(eventId, s)

    // recover a match that was running when the process died
    if (event.currentMatchId) {
      const match = this.db
        .select()
        .from(tables.matches)
        .where(eq(tables.matches.id, event.currentMatchId))
        .get()
      if (match && match.status === "running" && match.startedAt) {
        const game = getGame(event.gameId)
        const startedAt = match.startedAt.getTime()
        const elapsed = Date.now() - startedAt
        if (elapsed < game.matchLengthMs) {
          s.running = true
          const current = game.timeline.find(
            (p) => elapsed >= p.startMs && elapsed < p.endMs
          )
          s.phase = current?.id ?? "no_entry"
          s.phaseEndsAt = current ? startedAt + current.endMs : null
          this.scheduleTransitions(eventId, game, startedAt)
        } else {
          // match ended while we were down — finalize without sounds
          this.db
            .update(tables.matches)
            .set({ status: "scored" })
            .where(eq(tables.matches.id, match.id))
            .run()
          s.phase = "post_match"
        }
      }
    }
    return s
  }

  private gameFor(eventId: string): GameDefinition<unknown> {
    return getGame(getEvent(this.db, eventId).gameId)
  }

  private scheduleTransitions(
    eventId: string,
    game: GameDefinition<unknown>,
    startedAt: number
  ): void {
    const s = this.ensure(eventId)
    this.clearTimers(s)
    const now = Date.now()
    for (const segment of game.timeline) {
      const at = startedAt + segment.startMs
      // first segment entered directly; past ones skipped on recovery
      if (at > now) {
        s.timers.push(
          setTimeout(() => {
            this.enterPhase(
              eventId,
              segment.id,
              startedAt + segment.endMs,
              segment.sound
            )
          }, at - now)
        )
      }
      // mid-segment cues (e.g. endgame warning) play a sound without a transition
      for (const cue of segment.cues ?? []) {
        const cueAt = startedAt + cue.atMs
        if (cueAt <= now) continue
        s.timers.push(
          setTimeout(() => {
            this.publishFn(eventId, "all", { type: "sound", cue: cue.sound })
          }, cueAt - now)
        )
      }
    }
    s.timers.push(
      setTimeout(
        () => {
          this.endMatch(eventId)
        },
        startedAt + game.matchLengthMs - now
      )
    )
  }

  private enterPhase(
    eventId: string,
    phase: string,
    phaseEndsAt: number,
    sound?: string
  ): void {
    const s = this.ensure(eventId)
    s.phase = phase
    s.phaseEndsAt = phaseEndsAt
    this.broadcastState(eventId)
    if (sound) this.publishFn(eventId, "all", { type: "sound", cue: sound })
  }

  private endMatch(eventId: string): void {
    const s = this.ensure(eventId)
    this.clearTimers(s)
    if (s.matchId) {
      this.db
        .update(tables.matches)
        .set({ status: "scored" })
        .where(eq(tables.matches.id, s.matchId))
        .run()
    }
    s.running = false
    s.phase = "post_match"
    s.phaseEndsAt = null
    this.broadcastState(eventId)
    if (s.matchId) this.publishScore(eventId, s.matchId)
    this.publishFn(eventId, "all", { type: "sound", cue: "match-end" })
  }

  private broadcastState(eventId: string): void {
    const s = this.ensure(eventId)
    this.publishFn(eventId, "all", {
      type: "match_state",
      matchId: s.matchId,
      phase: s.phase,
      phaseEndsAt: s.phaseEndsAt,
      serverNow: Date.now(),
    })
  }

  /**
   * Broadcast a match's current status + cached scores. `match_state` carries
   * the field/timer state but not the match record's status, so when the engine
   * flips a match to "scored" (match end / field fault) clients need this to
   * enable "Publish results" without a reload.
   */
  private publishScore(eventId: string, matchId: string): void {
    const match = getMatch(this.db, matchId)
    this.publishFn(eventId, "all", {
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

  private clearTimers(s: EngineEventState): void {
    for (const timer of s.timers) clearTimeout(timer)
    s.timers = []
  }
}
