import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"
import { nanoid } from "nanoid"
import type { JsonObject } from "@/shared/json"

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => nanoid())

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())

export type UserRole = "admin" | "team"

export const users = sqliteTable("users", {
  id: id(),
  role: text("role").$type<UserRole>().notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  teamId: text("team_id").references(() => teams.id),
  createdAt: createdAt(),
})

export const sessions = sqliteTable("sessions", {
  // sha256 hex of the bearer token; the raw token never touches the DB
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
})

export const teams = sqliteTable("teams", {
  id: id(),
  number: integer("number").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
})

export const participants = sqliteTable("participants", {
  id: id(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
})

export type EventStatus =
  | "setup"
  | "quals"
  | "alliance_selection"
  | "playoffs"
  | "complete"

export interface EventSettings {
  qualRoundsPerTeam?: number
}

export const events = sqliteTable("events", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  gameId: text("game_id").notNull().default("stronghold2016"),
  status: text("status").$type<EventStatus>().notNull().default("setup"),
  // no FK: matches already references events and SQLite can't add the cycle later
  currentMatchId: text("current_match_id"),
  displayView: text("display_view").notNull().default("intermission"),
  settings: text("settings", { mode: "json" })
    .$type<EventSettings>()
    .notNull()
    .default({}),
  createdAt: createdAt(),
})

export type SelectionStatus =
  | "available"
  | "captain"
  | "picked"
  | "declined"
  | "backup"

export const eventTeams = sqliteTable(
  "event_teams",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    selectionStatus: text("selection_status")
      .$type<SelectionStatus>()
      .notNull()
      .default("available"),
  },
  (t) => [uniqueIndex("event_teams_event_team_unique").on(t.eventId, t.teamId)]
)

// `practice` matches never count toward rankings or team statistics
export type MatchType = "qualification" | "playoff" | "practice"
export type MatchStatus = "scheduled" | "running" | "scored" | "posted"
export type AllianceColor = "red" | "blue"

export const matches = sqliteTable(
  "matches",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    type: text("type").$type<MatchType>().notNull(),
    number: integer("number").notNull(),
    set: integer("set").notNull().default(1),
    bracketSlot: text("bracket_slot"),
    // 'seed:1' | 'winner:UB-R1-M1' | 'loser:UB-R1-M1'
    redSource: text("red_source"),
    blueSource: text("blue_source"),
    red1: text("red1").references(() => teams.id),
    red2: text("red2").references(() => teams.id),
    red3: text("red3").references(() => teams.id),
    blue1: text("blue1").references(() => teams.id),
    blue2: text("blue2").references(() => teams.id),
    blue3: text("blue3").references(() => teams.id),
    redAllianceId: text("red_alliance_id").references(() => alliances.id),
    blueAllianceId: text("blue_alliance_id").references(() => alliances.id),
    status: text("status").$type<MatchStatus>().notNull().default("scheduled"),
    scheduledOrder: integer("scheduled_order").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    // cached aggregates produced by the game plugin reducer over score_events
    redScore: text("red_score", { mode: "json" }).$type<JsonObject>(),
    blueScore: text("blue_score", { mode: "json" }).$type<JsonObject>(),
    redPoints: integer("red_points"),
    bluePoints: integer("blue_points"),
    redRP: integer("red_rp"),
    blueRP: integer("blue_rp"),
    winner: text("winner").$type<AllianceColor | "tie">(),
    surrogates: text("surrogates", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    disqualifications: text("disqualifications", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
  },
  (t) => [index("matches_event_order_idx").on(t.eventId, t.scheduledOrder)]
)

export const scoreEvents = sqliteTable(
  "score_events",
  {
    id: id(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    alliance: text("alliance").$type<AllianceColor>().notNull(),
    type: text("type").notNull(),
    payload: text("payload", { mode: "json" })
      .$type<JsonObject>()
      .notNull()
      .default({}),
    // computed server-side from matches.startedAt; client clocks are never trusted
    matchTimeMs: integer("match_time_ms").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    undone: integer("undone", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("score_events_match_idx").on(t.matchId)]
)

export const alliances = sqliteTable(
  "alliances",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    captainTeamId: text("captain_team_id").references(() => teams.id),
    pick1TeamId: text("pick1_team_id").references(() => teams.id),
    pick2TeamId: text("pick2_team_id").references(() => teams.id),
    backupTeamId: text("backup_team_id").references(() => teams.id),
  },
  (t) => [uniqueIndex("alliances_event_number_unique").on(t.eventId, t.number)]
)

export type SelectionActionType = "invite" | "accept" | "decline" | "undo"

export const selectionActions = sqliteTable(
  "selection_actions",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    type: text("type").$type<SelectionActionType>().notNull(),
    payload: text("payload", { mode: "json" })
      .$type<JsonObject>()
      .notNull()
      .default({}),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("selection_actions_event_idx").on(t.eventId)]
)
