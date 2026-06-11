import { z } from "zod"

export const REALTIME_PATH = "/_ws"

export const channels = ["display", "control", "judge", "public"] as const
export type Channel = (typeof channels)[number]

export function topicFor(eventId: string, channel: Channel): string {
  return `event:${eventId}:${channel}`
}

// client -> server
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe"),
    topics: z.array(z.string()).max(16),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    topics: z.array(z.string()).max(16),
  }),
  z.object({ type: z.literal("ping"), sentAt: z.number() }),
])
export type ClientMessage = z.infer<typeof clientMessageSchema>

const totalsSchema = z.object({
  auto: z.number(),
  teleop: z.number(),
  endgame: z.number(),
  penalty: z.number(),
  bonus: z.number(),
  total: z.number(),
  breach: z.boolean(),
  capture: z.boolean(),
  boulders: z.number(),
})

// server -> client
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("match_state"),
    matchId: z.string().nullable(),
    phase: z.string(),
    /** absolute deadline (server epoch ms); clients render countdowns locally */
    phaseEndsAt: z.number().nullable(),
    serverNow: z.number(),
  }),
  z.object({
    type: z.literal("score_update"),
    matchId: z.string(),
    status: z.string(),
    winner: z.string().nullable(),
    red: totalsSchema.nullable(),
    blue: totalsSchema.nullable(),
    redState: z.unknown(),
    blueState: z.unknown(),
  }),
  z.object({ type: z.literal("view_change"), view: z.string() }),
  z.object({
    type: z.literal("toast"),
    message: z.string(),
    variant: z.enum(["info", "warning", "success"]),
    durationMs: z.number().nullable(),
  }),
  z.object({ type: z.literal("selection_update"), payload: z.unknown() }),
  z.object({ type: z.literal("bracket_update"), payload: z.unknown() }),
  z.object({ type: z.literal("judges_update"), payload: z.unknown() }),
  z.object({ type: z.literal("sound"), cue: z.string() }),
  z.object({
    type: z.literal("pong"),
    sentAt: z.number(),
    serverNow: z.number(),
  }),
])
export type ServerMessage = z.infer<typeof serverMessageSchema>
