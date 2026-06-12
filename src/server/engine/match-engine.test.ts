import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { tables } from "@/db"
import type { Db } from "@/db"
import { createTestDb } from "@/db/db.test"
import { createEvent } from "@/server/services/events"
import { createTeam } from "@/server/services/teams"
import { recordScoreEvent } from "@/server/services/scoring"
import type { ServerMessage } from "@/shared/realtime-messages"
import { MatchEngine } from "./match-engine"

let db: Db
let engine: MatchEngine
let eventId: string
let matchId: string
let adminId: string
let published: Array<{ eventId: string; message: ServerMessage }>

function makeMatch(number = 1) {
  return db
    .insert(tables.matches)
    .values({ eventId, type: "qualification", number, scheduledOrder: number })
    .returning()
    .get().id
}

function messagesOf(type: ServerMessage["type"]) {
  return published.filter((p) => p.message.type === type).map((p) => p.message)
}

function lastState() {
  const states = messagesOf("match_state")
  return states[states.length - 1] as
    | Extract<ServerMessage, { type: "match_state" }>
    | undefined
}

beforeEach(() => {
  vi.useFakeTimers()
  db = createTestDb()
  published = []
  engine = new MatchEngine(db, (evId, _to, message) =>
    published.push({ eventId: evId, message })
  )
  adminId = db
    .insert(tables.users)
    .values({ role: "admin", username: "a", passwordHash: "x" })
    .returning()
    .get().id
  eventId = createEvent(db, { name: "Engine Test" }).id
  createTeam(db, { number: 1, name: "T1" })
  matchId = makeMatch()
})

afterEach(() => {
  engine.dispose()
  vi.useRealTimers()
})

describe("match engine", () => {
  it("starts idle in no_entry", () => {
    const state = engine.getFieldState(eventId)
    expect(state).toMatchObject({
      matchId: null,
      phase: "no_entry",
      running: false,
    })
  })

  it("queues a match and persists currentMatchId", () => {
    engine.setCurrentMatch(eventId, matchId)
    expect(engine.getFieldState(eventId).matchId).toBe(matchId)
    const event = db
      .select()
      .from(tables.events)
      .where(eq(tables.events.id, eventId))
      .get()
    expect(event?.currentMatchId).toBe(matchId)
  })

  it("runs the Stronghold timeline: auto, buzzer+pause, teleop, endgame cue", () => {
    engine.setCurrentMatch(eventId, matchId)
    engine.playMatch(eventId)

    expect(lastState()?.phase).toBe("auto")
    expect(messagesOf("sound").at(-1)).toMatchObject({ cue: "match-start" })

    vi.advanceTimersByTime(15_000) // t = 15s — auto ends, buzzer + pause
    expect(lastState()?.phase).toBe("pause")
    expect(messagesOf("sound").at(-1)).toMatchObject({ cue: "match-end" })

    vi.advanceTimersByTime(3_500) // t = 18.5s — teleop starts
    expect(lastState()?.phase).toBe("teleop")
    expect(messagesOf("sound").at(-1)).toMatchObject({ cue: "teleop-start" })

    vi.advanceTimersByTime(105_000) // t = 123.5s — endgame warning, no transition
    expect(lastState()?.phase).toBe("teleop")
    expect(messagesOf("sound").at(-1)).toMatchObject({ cue: "endgame-start" })

    vi.advanceTimersByTime(30_000) // t = 153.5s — match ends
    expect(lastState()?.phase).toBe("post_match")
    expect(messagesOf("sound").at(-1)).toMatchObject({ cue: "match-end" })
    expect(engine.getFieldState(eventId).running).toBe(false)

    const match = db.select().from(tables.matches).all()[0]
    expect(match.status).toBe("scored")

    // clients learn the new "scored" status via a score_update, so the control
    // panel can enable "Publish results" without a reload
    expect(messagesOf("score_update").at(-1)).toMatchObject({
      matchId,
      status: "scored",
    })
  })

  it("publishes absolute phase deadlines", () => {
    engine.setCurrentMatch(eventId, matchId)
    const before = Date.now()
    engine.playMatch(eventId)
    const state = lastState()
    expect(state?.phaseEndsAt).toBe(before + 15_000)
  })

  it("refuses phase controls while running", () => {
    engine.setCurrentMatch(eventId, matchId)
    engine.playMatch(eventId)
    expect(() => engine.playMatch(eventId)).toThrow(/already running/)
    expect(() => engine.safeToEnter(eventId)).toThrow(/running/)
    expect(() => engine.noEntry(eventId)).toThrow(/running/)
    expect(() => engine.setCurrentMatch(eventId, matchId)).toThrow(/running/)
    expect(() => engine.replayMatch(eventId)).toThrow(/running/)
  })

  it("field fault aborts the chain and keeps scores", () => {
    engine.setCurrentMatch(eventId, matchId)
    engine.playMatch(eventId)
    vi.advanceTimersByTime(20_000) // teleop
    recordScoreEvent(db, {
      matchId,
      alliance: "red",
      type: "HIGH_GOAL",
      payload: {},
      createdBy: adminId,
    })

    engine.fieldFault(eventId)
    expect(engine.getFieldState(eventId)).toMatchObject({
      phase: "fault",
      running: false,
    })
    expect(messagesOf("sound").at(-1)).toMatchObject({ cue: "field-fault" })

    // no further transitions fire
    const stateCount = messagesOf("match_state").length
    vi.advanceTimersByTime(200_000)
    expect(messagesOf("match_state").length).toBe(stateCount)

    const match = db.select().from(tables.matches).all()[0]
    expect(match.status).toBe("scored")
    expect(db.select().from(tables.scoreEvents).all()).toHaveLength(1)

    // a field fault also flips the match to "scored"; clients need to hear it
    expect(messagesOf("score_update").at(-1)).toMatchObject({
      matchId,
      status: "scored",
    })
  })

  it("replay clears score events and re-arms the match", () => {
    engine.setCurrentMatch(eventId, matchId)
    engine.playMatch(eventId)
    vi.advanceTimersByTime(20_000)
    recordScoreEvent(db, {
      matchId,
      alliance: "red",
      type: "HIGH_GOAL",
      payload: {},
      createdBy: adminId,
    })
    engine.fieldFault(eventId)

    engine.replayMatch(eventId)
    expect(db.select().from(tables.scoreEvents).all()).toHaveLength(0)
    const match = db.select().from(tables.matches).all()[0]
    expect(match.status).toBe("scheduled")
    expect(match.startedAt).toBeNull()

    // can run again after replay
    engine.playMatch(eventId)
    expect(engine.getFieldState(eventId).running).toBe(true)
  })

  it("recovers a running match from the database after a restart", () => {
    engine.setCurrentMatch(eventId, matchId)
    engine.playMatch(eventId)
    vi.advanceTimersByTime(20_000) // teleop, t=20s

    // simulate a process restart: new engine instance, same db
    engine.dispose()
    published = []
    engine = new MatchEngine(db, (evId, _to, message) =>
      published.push({ eventId: evId, message })
    )

    const state = engine.getFieldState(eventId)
    expect(state).toMatchObject({ matchId, phase: "teleop", running: true })

    // remaining transitions/cues still fire at the original absolute times
    vi.advanceTimersByTime(103_500) // t = 123.5s — endgame warning cue
    expect(messagesOf("sound").at(-1)).toMatchObject({ cue: "endgame-start" })
    vi.advanceTimersByTime(30_000) // t = 153.5s
    expect(lastState()?.phase).toBe("post_match")
  })

  it("finalizes a match that ended while the server was down", () => {
    engine.setCurrentMatch(eventId, matchId)
    engine.playMatch(eventId)
    engine.dispose() // timers gone, match still 'running' in db

    vi.advanceTimersByTime(500_000)
    engine = new MatchEngine(db, (evId, _to, message) =>
      published.push({ eventId: evId, message })
    )
    expect(engine.getFieldState(eventId)).toMatchObject({
      phase: "post_match",
      running: false,
    })
    const match = db.select().from(tables.matches).all()[0]
    expect(match.status).toBe("scored")
  })

  it("refuses to play without a queued match and to replay posted matches", () => {
    expect(() => engine.playMatch(eventId)).toThrow(/select a match/i)
    engine.setCurrentMatch(eventId, matchId)
    db.update(tables.matches)
      .set({ status: "posted" })
      .where(eq(tables.matches.id, matchId))
      .run()
    expect(() => engine.playMatch(eventId)).toThrow(/posted/)
    expect(() => engine.replayMatch(eventId)).toThrow(/posted/i)
  })

  it("safe to enter publishes a timed toast", () => {
    engine.safeToEnter(eventId)
    expect(messagesOf("toast").at(-1)).toMatchObject({ durationMs: 8000 })
    engine.noEntry(eventId)
    expect(messagesOf("toast").at(-1)).toMatchObject({
      durationMs: null,
      variant: "warning",
    })
  })
})
