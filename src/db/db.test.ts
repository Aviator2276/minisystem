import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { createDb, tables } from "./index"
import type { Db } from "./index"

export function createTestDb(): Db {
  const db = createDb(":memory:")
  // apply generated migrations so tests exercise the same DDL as production
  const dir = "src/db/migrations"
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const stmt of readFileSync(`${dir}/${file}`, "utf8").split(
      "--> statement-breakpoint"
    )) {
      db.run(sql.raw(stmt))
    }
  }
  return db
}

describe("db schema", () => {
  it("inserts and reads back across tables", () => {
    const db = createTestDb()

    const [team] = db
      .insert(tables.teams)
      .values({ number: 42, name: "Answer" })
      .returning()
      .all()
    const [user] = db
      .insert(tables.users)
      .values({
        role: "team",
        username: "42",
        passwordHash: "x",
        teamId: team.id,
      })
      .returning()
      .all()
    const [event] = db
      .insert(tables.events)
      .values({ name: "Test Event", slug: "test" })
      .returning()
      .all()
    db.insert(tables.eventTeams)
      .values({ eventId: event.id, teamId: team.id })
      .run()
    const [match] = db
      .insert(tables.matches)
      .values({
        eventId: event.id,
        type: "qualification",
        number: 1,
        scheduledOrder: 1,
        red1: team.id,
      })
      .returning()
      .all()
    db.insert(tables.scoreEvents)
      .values({
        matchId: match.id,
        alliance: "red",
        type: "HIGH_GOAL",
        payload: { robotIndex: 0 },
        matchTimeMs: 12_000,
        createdBy: user.id,
      })
      .run()

    const fetched = db.query.scoreEvents.findFirst().sync()
    expect(fetched?.payload).toEqual({ robotIndex: 0 })
    expect(fetched?.undone).toBe(false)
    expect(db.query.events.findFirst().sync()?.status).toBe("setup")
    expect(db.query.matches.findFirst().sync()?.surrogates).toEqual([])
  })

  it("enforces unique team numbers and event/team pairs", () => {
    const db = createTestDb()
    db.insert(tables.teams).values({ number: 7, name: "A" }).run()
    expect(() =>
      db.insert(tables.teams).values({ number: 7, name: "B" }).run()
    ).toThrow()

    const [team] = db
      .insert(tables.teams)
      .values({ number: 8, name: "C" })
      .returning()
      .all()
    const [event] = db
      .insert(tables.events)
      .values({ name: "E", slug: "e" })
      .returning()
      .all()
    db.insert(tables.eventTeams)
      .values({ eventId: event.id, teamId: team.id })
      .run()
    expect(() =>
      db
        .insert(tables.eventTeams)
        .values({ eventId: event.id, teamId: team.id })
        .run()
    ).toThrow()
  })
})
