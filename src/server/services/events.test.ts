import { beforeEach, describe, expect, it } from "vitest"
import { createTestDb } from "@/db/db.test"
import type { Db } from "@/db"
import { createTeam } from "./teams"
import { attachTeams, createEvent, listEventTeams } from "./events"

let db: Db
let eventId: string

beforeEach(() => {
  db = createTestDb()
  eventId = createEvent(db, { name: "Dup Test" }).id
})

describe("attachTeams", () => {
  it("attaches distinct teams and reports how many were fresh", () => {
    const a = createTeam(db, { number: 1, name: "A" }).id
    const b = createTeam(db, { number: 2, name: "B" }).id
    expect(attachTeams(db, eventId, [a, b]).attached).toBe(2)
    // re-attaching the same teams is a no-op
    expect(attachTeams(db, eventId, [a, b]).attached).toBe(0)
    expect(listEventTeams(db, eventId)).toHaveLength(2)
  })

  it("rejects a second team sharing a number already on the roster", () => {
    const first = createTeam(db, { number: 254, name: "First" }).id
    const dup = createTeam(db, { number: 254, name: "Dup" }).id
    expect(attachTeams(db, eventId, [first]).attached).toBe(1)
    // the duplicate-numbered team is skipped, preserving per-event uniqueness
    const result = attachTeams(db, eventId, [dup])
    expect(result.attached).toBe(0)
    expect(result.skipped).toEqual([
      {
        number: 254,
        name: "Dup",
        reason: "number 254 is already on this event's roster",
      },
    ])
    expect(listEventTeams(db, eventId)).toHaveLength(1)
  })

  it("keeps only one of several same-numbered teams in a single batch", () => {
    const a = createTeam(db, { number: 9, name: "A" }).id
    const b = createTeam(db, { number: 9, name: "B" }).id
    expect(attachTeams(db, eventId, [a, b]).attached).toBe(1)
    expect(listEventTeams(db, eventId)).toHaveLength(1)
  })
})
