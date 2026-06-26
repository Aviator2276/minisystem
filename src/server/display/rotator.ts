import { eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import type { PublishFn } from "@/server/engine/match-engine"
import { getEvent, listEventTeams } from "@/server/services/events"
import { getMatch, listMatches } from "@/server/services/matches"
import {
  MANUAL_OVERRIDE_MS,
  ROTATE_SLIDE_MS,
  nextRotationView,
  rotationSet,
  slideDwellMs,
} from "@/shared/view-rotation"
import type { RotatableView } from "@/shared/view-rotation"

/** how often to re-check while a match is running (we never rotate over it) */
const RUNNING_RECHECK_MS = 3_000

/**
 * Server-authoritative "Auto rotate views" driver. While the setting is on, it
 * advances `events.displayView` through the rotation set on a timer and
 * broadcasts `view_change`, so every client (display, TV, and the control
 * panel's view buttons) follows the same cadence. A manual `setDisplayView`
 * holds the chosen view for `MANUAL_OVERRIDE_MS` before rotation resumes.
 *
 * One timer per event, held in a process-wide singleton (see instance.ts) so
 * dev-server reloads don't spawn duplicates.
 */
export class ViewRotator {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  // events pinned by "Hide after match end" — rotation stays put (on camera)
  // until the next match is queued, even across display reconnects (sync).
  private held = new Set<string>()

  constructor(
    private db: Db,
    private publishFn: PublishFn
  ) {}

  /** Read the event, or null if it's gone (deleted, or not in this db). */
  private eventOrNull(eventId: string) {
    try {
      return getEvent(this.db, eventId)
    } catch {
      return null
    }
  }

  /** (Re)evaluate whether this event should be rotating. Idempotent — safe to
   * call on every display bootstrap / settings change. */
  sync(eventId: string): void {
    const event = this.eventOrNull(eventId)
    if (!event || !event.settings.autoRotateViews || this.held.has(eventId)) {
      this.stop(eventId)
      return
    }
    if (this.timers.has(eventId)) return // already running
    // treat the current view as the active slide, then advance after its dwell
    this.schedule(eventId, this.dwellFor(eventId, event.displayView))
  }

  /** An admin manually picked a view: hold it, then resume rotation. A deliberate
   * pick also clears any post-match camera hold. */
  manualOverride(eventId: string): void {
    this.held.delete(eventId)
    const event = this.eventOrNull(eventId)
    if (!event || !event.settings.autoRotateViews) {
      this.stop(eventId)
      return
    }
    this.schedule(eventId, MANUAL_OVERRIDE_MS)
  }

  /**
   * Pin the display where it is (used after "Hide after match end" drops to
   * camera) so rotation doesn't pull it away. No-op unless auto-rotation is on.
   */
  hold(eventId: string): void {
    if (!this.eventOrNull(eventId)?.settings.autoRotateViews) return
    this.held.add(eventId)
    this.stop(eventId)
  }

  /** Release a post-match hold (the next match was queued) and resume rotation. */
  release(eventId: string): void {
    this.held.delete(eventId)
    this.sync(eventId)
  }

  stop(eventId: string): void {
    const timer = this.timers.get(eventId)
    if (timer) clearTimeout(timer)
    this.timers.delete(eventId)
  }

  /** test/shutdown hook */
  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  private schedule(eventId: string, delayMs: number): void {
    this.stop(eventId)
    this.timers.set(
      eventId,
      setTimeout(() => this.tick(eventId), delayMs)
    )
  }

  private tick(eventId: string): void {
    this.timers.delete(eventId)
    try {
      const event = getEvent(this.db, eventId)
      if (!event.settings.autoRotateViews) return

      // never pull a live match off the audience screen — wait it out
      if (this.isMatchRunning(event.currentMatchId)) {
        this.schedule(eventId, RUNNING_RECHECK_MS)
        return
      }

      const set = this.rotationSetFor(eventId, event)
      const next = nextRotationView(set, event.displayView)
      if (!next) {
        this.schedule(eventId, ROTATE_SLIDE_MS) // nothing yet; re-check later
        return
      }

      this.db
        .update(tables.events)
        .set({ displayView: next })
        .where(eq(tables.events.id, eventId))
        .run()
      this.publishFn(eventId, "all", { type: "view_change", view: next })
      this.schedule(eventId, this.dwellFor(eventId, next))
    } catch {
      // event deleted or transient DB error — let the rotation lapse
      this.stop(eventId)
    }
  }

  private rotationSetFor(
    eventId: string,
    event: ReturnType<typeof getEvent>
  ): RotatableView[] {
    const matches = listMatches(this.db, eventId)
    return rotationSet({
      alwaysShowLineup: event.settings.alwaysShowLineup ?? false,
      isPlayoffs: event.status === "playoffs",
      hasRankings: listEventTeams(this.db, eventId).length > 0,
      hasSchedule: matches.length > 0,
      hasBracket: matches.some((m) => m.type === "playoff"),
    })
  }

  private isMatchRunning(matchId: string | null): boolean {
    return matchId ? getMatch(this.db, matchId).status === "running" : false
  }

  private dwellFor(eventId: string, view: string): number {
    if (view !== "rankings") return ROTATE_SLIDE_MS
    return slideDwellMs("rankings", listEventTeams(this.db, eventId).length)
  }
}
