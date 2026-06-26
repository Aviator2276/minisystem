import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { tables } from "@/db"
import type { Db } from "@/db"
import { createTestDb } from "@/db/db.test"
import {
  attachTeams,
  createEvent,
  setDisplayBehavior,
} from "@/server/services/events"
import { createTeam } from "@/server/services/teams"
import type { ServerMessage } from "@/shared/realtime-messages"
import { MANUAL_OVERRIDE_MS, ROTATE_SLIDE_MS } from "@/shared/view-rotation"
import { ViewRotator } from "./rotator"

let db: Db
let rotator: ViewRotator
let eventId: string
let views: string[]

function viewOf() {
  return db
    .select({ v: tables.events.displayView })
    .from(tables.events)
    .where(eq(tables.events.id, eventId))
    .get()!.v
}

function setView(view: string) {
  db.update(tables.events)
    .set({ displayView: view })
    .where(eq(tables.events.id, eventId))
    .run()
}

beforeEach(() => {
  vi.useFakeTimers()
  db = createTestDb()
  views = []
  rotator = new ViewRotator(db, (_e, _to, message: ServerMessage) => {
    if (message.type === "view_change") views.push(message.view)
  })
  eventId = createEvent(db, { name: "Rotator Test" }).id
  attachTeams(
    db,
    eventId,
    Array.from(
      { length: 4 },
      (_, i) => createTeam(db, { number: i + 1, name: `T${i + 1}` }).id
    )
  )
  db.insert(tables.matches)
    .values({
      eventId,
      type: "qualification",
      number: 1,
      scheduledOrder: 1,
    })
    .run()
})

afterEach(() => {
  rotator.dispose()
  vi.useRealTimers()
})

describe("ViewRotator", () => {
  it("does nothing while the setting is off", () => {
    setView("lineup")
    rotator.sync(eventId)
    vi.advanceTimersByTime(ROTATE_SLIDE_MS * 5)
    expect(views).toEqual([])
    expect(viewOf()).toBe("lineup")
  })

  it("cycles lineup → rankings → schedule and broadcasts each step", () => {
    setView("lineup")
    setDisplayBehavior(db, eventId, "autoRotateViews", true)
    rotator.sync(eventId)

    vi.advanceTimersByTime(ROTATE_SLIDE_MS) // lineup dwell → rankings
    expect(viewOf()).toBe("rankings")
    // rankings dwells one page (4 teams) = one slide
    vi.advanceTimersByTime(ROTATE_SLIDE_MS) // rankings → schedule
    expect(viewOf()).toBe("schedule")
    vi.advanceTimersByTime(ROTATE_SLIDE_MS) // schedule → lineup (wrap)
    expect(viewOf()).toBe("lineup")

    expect(views).toEqual(["rankings", "schedule", "lineup"])
  })

  it("holds a manual pick for the override window, then resumes", () => {
    setView("rankings")
    setDisplayBehavior(db, eventId, "autoRotateViews", true)
    // admin manually parks on the match view
    setView("match")
    rotator.manualOverride(eventId)

    vi.advanceTimersByTime(MANUAL_OVERRIDE_MS - 1000)
    expect(viewOf()).toBe("match") // still held
    vi.advanceTimersByTime(1000) // override elapses → jumps into the set
    expect(viewOf()).toBe("lineup")
    expect(views).toEqual(["lineup"])
  })

  it("holds on camera after match-end and resumes when the next match is queued", () => {
    setView("camera")
    setDisplayBehavior(db, eventId, "autoRotateViews", true)
    rotator.hold(eventId) // "Hide after match end" pinned us on camera

    vi.advanceTimersByTime(ROTATE_SLIDE_MS * 3)
    expect(viewOf()).toBe("camera")
    expect(views).toEqual([])

    // a display reconnect (sync) must not break the hold
    rotator.sync(eventId)
    vi.advanceTimersByTime(ROTATE_SLIDE_MS * 2)
    expect(viewOf()).toBe("camera")

    // queuing the next match releases the hold and rotation resumes
    rotator.release(eventId)
    vi.advanceTimersByTime(ROTATE_SLIDE_MS)
    expect(viewOf()).toBe("lineup")
  })

  it("never rotates a running match off the screen", () => {
    const matchId = db
      .select({ id: tables.matches.id })
      .from(tables.matches)
      .where(eq(tables.matches.eventId, eventId))
      .get()!.id
    db.update(tables.matches)
      .set({ status: "running" })
      .where(eq(tables.matches.id, matchId))
      .run()
    db.update(tables.events)
      .set({ currentMatchId: matchId, displayView: "match" })
      .where(eq(tables.events.id, eventId))
      .run()
    setDisplayBehavior(db, eventId, "autoRotateViews", true)
    rotator.sync(eventId)

    vi.advanceTimersByTime(ROTATE_SLIDE_MS * 3)
    expect(viewOf()).toBe("match") // stayed put while running
    expect(views).toEqual([])

    // once the match finishes, rotation resumes on the next check
    db.update(tables.matches)
      .set({ status: "scored" })
      .where(eq(tables.matches.id, matchId))
      .run()
    vi.advanceTimersByTime(3000)
    expect(viewOf()).toBe("lineup")
  })
})
