import { beforeEach, describe, expect, it } from "vitest"
import { tables } from "@/db"
import type { Db } from "@/db"
import { createTestDb } from "@/db/db.test"
import {
  SelectionError,
  reduceSelection,
} from "@/server/selection/state-machine"
import { advanceStatus, attachTeams, createEvent } from "./events"
import { computeRankings } from "./rankings"
import { applySelectionAction, getSelectionState } from "./selection"
import { createTeam } from "./teams"

let db: Db
let adminId: string
let eventId: string
let teamIds: string[]

beforeEach(() => {
  db = createTestDb()
  adminId = db
    .insert(tables.users)
    .values({ role: "admin", username: "a", passwordHash: "x" })
    .returning()
    .get().id
  eventId = createEvent(db, { name: "Selection Test" }).id
  // teams 1..6 -> with no posted matches every team ties, so the rank order is
  // ascending team number: [t1, t2, t3, t4, t5, t6]
  teamIds = Array.from({ length: 6 }, (_, i) => {
    const n = i + 1
    return createTeam(db, { number: n, name: `T${n}` }).id
  })
  attachTeams(db, eventId, teamIds)
})

/** Runs a complete 2-alliance selection: captains t1/t2, picks fill the rest. */
function runSelection() {
  advanceStatus(db, eventId, "quals")
  advanceStatus(db, eventId, "alliance_selection")
  const [t1, t2, t3, t4, t5, t6] = teamIds
  void t1
  void t2
  const invites = [t4, t5, t6, t3] // A1, A2, A2, A1 (snake)
  for (const teamId of invites) {
    applySelectionAction(db, eventId, { type: "invite", teamId }, adminId)
    applySelectionAction(db, eventId, { type: "accept" }, adminId)
  }
}

describe("getSelectionState", () => {
  it("reads materialized alliances in playoffs even if rankings later shift", () => {
    runSelection()
    advanceStatus(db, eventId, "playoffs")

    // Edit history shifts the rank order: t3 (a recorded pick) wins a qual and
    // jumps to rank #1, which would make it a *captain* on a naive replay.
    const [t1, t2, t3] = teamIds
    db.insert(tables.matches)
      .values({
        eventId,
        type: "qualification",
        number: 99,
        scheduledOrder: 99,
        red1: t3,
        status: "posted",
        winner: "red",
        redRP: 2,
      })
      .run()

    // sanity: t3 is now top-ranked, so replaying the invite log throws
    const ranked = computeRankings(db, eventId).map((r) => r.teamId)
    expect(ranked[0]).toBe(t3)
    const actions = [
      { type: "invite", teamId: teamIds[3] },
      { type: "accept" },
      { type: "invite", teamId: teamIds[4] },
      { type: "accept" },
      { type: "invite", teamId: teamIds[5] },
      { type: "accept" },
      { type: "invite", teamId: t3 },
      { type: "accept" },
    ] as const
    expect(() => reduceSelection(ranked, [...actions], 2)).toThrow(
      SelectionError
    )

    // the fix: the finalized selection is read from persisted rows, not replayed
    const state = getSelectionState(db, eventId)
    expect(state.complete).toBe(true)
    expect(state.allianceCount).toBe(2)
    const a1 = state.alliances.find((a) => a.number === 1)!
    const a2 = state.alliances.find((a) => a.number === 2)!
    expect(a1.captain?.teamId).toBe(t1)
    expect(a1.picks.map((p) => p.teamId).sort()).toEqual(
      [teamIds[3], t3].sort()
    )
    expect(a2.captain?.teamId).toBe(t2)
  })

  it("still derives live state during alliance selection", () => {
    advanceStatus(db, eventId, "quals")
    advanceStatus(db, eventId, "alliance_selection")
    const state = getSelectionState(db, eventId)
    expect(state.complete).toBe(false)
    expect(state.currentAllianceNumber).toBe(1)
    expect(state.alliances[0].captain?.teamId).toBe(teamIds[0])
  })
})
